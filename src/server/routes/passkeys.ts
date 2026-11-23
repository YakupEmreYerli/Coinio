import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { and, eq } from 'drizzle-orm';
import { Router, type CookieOptions } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { requireSession } from '../auth/middleware.js';
import {
  MAX_PASSKEYS_PER_USER,
  countPasskeys,
  createChallengeStore,
  defaultPasskeyOps,
  listPasskeys,
  resolveWebAuthnOrigin,
  type PasskeyOps,
} from '../auth/passkeys.js';
import { SESSION_COOKIE, SESSION_TTL_MS, createSession } from '../auth/sessions.js';
import { passkeys, users } from '../db/schema.js';
import { userAllowed } from '../plugins.js';
import type { ServiceCtx } from '../services/context.js';

const verifyRegisterBody = z.object({
  challengeToken: z.string().min(1),
  response: z.custom<RegistrationResponseJSON>((v) => typeof v === 'object' && v !== null && typeof (v as { id?: unknown }).id === 'string'),
  name: z.string().trim().max(60).optional(),
});

const verifyLoginBody = z.object({
  challengeToken: z.string().min(1),
  response: z.custom<AuthenticationResponseJSON>((v) => typeof v === 'object' && v !== null && typeof (v as { id?: unknown }).id === 'string'),
});

const renameBody = z.object({ name: z.string().trim().min(1).max(60) });

export function passkeyRouter(ctx: ServiceCtx, ops: PasskeyOps = defaultPasskeyOps): Router {
  const { db, config, now } = ctx;
  const router = Router();
  const challenges = createChallengeStore();

  const cookieOptions: CookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.publicUrl?.startsWith('https://') ?? false,
    maxAge: SESSION_TTL_MS,
    path: '/',
  };

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: 'too_many_attempts' });
    },
  });

  router.get('/passkey/status', (req, res) => {
    res.json({ supported: resolveWebAuthnOrigin(config, req) !== null });
  });

  router.get('/passkeys', requireSession(db, now), (req, res) => {
    res.json({
      supported: resolveWebAuthnOrigin(config, req) !== null,
      passkeys: listPasskeys(db, req.userId!),
    });
  });

  router.post('/passkey/register/options', limiter, requireSession(db, now), async (req, res) => {
    const origin = resolveWebAuthnOrigin(config, req);
    if (!origin) return void res.status(400).json({ error: 'https_required' });
    const userId = req.userId!;
    if (countPasskeys(db, userId) >= MAX_PASSKEYS_PER_USER) {
      return void res.status(400).json({ error: 'limit_reached', limit: MAX_PASSKEYS_PER_USER });
    }
    const user = db.select().from(users).where(eq(users.id, userId)).get();
    if (!user) return void res.status(401).json({ error: 'unauthorized' });

    const existing = db.select({ id: passkeys.id, transports: passkeys.transports }).from(passkeys).where(eq(passkeys.userId, userId)).all();
    const options = await ops.generateRegistrationOptions({
      rpName: origin.rpName,
      rpID: origin.rpID,
      userName: user.username,
      userDisplayName: user.username,
      userID: Uint8Array.from(Buffer.from(String(user.id), 'utf8')),
      excludeCredentials: existing.map((row) => ({ id: row.id, transports: row.transports ?? undefined })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    });

    const challengeToken = challenges.issue(now(), {
      challenge: options.challenge,
      kind: 'register',
      userId,
      rpID: origin.rpID,
      expectedOrigin: origin.expectedOrigin,
    });
    res.json({ challengeToken, options });
  });

  router.post('/passkey/register/verify', limiter, requireSession(db, now), async (req, res) => {
    const parsed = verifyRegisterBody.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: 'validation' });
    const userId = req.userId!;
    const pending = challenges.consume(now(), parsed.data.challengeToken, 'register', userId);
    if (!pending) return void res.status(400).json({ error: 'invalid_challenge' });
    if (countPasskeys(db, userId) >= MAX_PASSKEYS_PER_USER) {
      return void res.status(400).json({ error: 'limit_reached', limit: MAX_PASSKEYS_PER_USER });
    }

    let verified;
    try {
      verified = await ops.verifyRegistrationResponse({
        response: parsed.data.response,
        expectedChallenge: pending.challenge,
        expectedOrigin: pending.expectedOrigin,
        expectedRPID: pending.rpID,
        requireUserVerification: false,
      });
    } catch {
      return void res.status(400).json({ error: 'verification_failed' });
    }
    if (!verified.verified) return void res.status(400).json({ error: 'verification_failed' });

    const { credential, credentialDeviceType, credentialBackedUp } = verified.registrationInfo;
    const duplicate = db.select({ id: passkeys.id }).from(passkeys).where(eq(passkeys.id, credential.id)).get();
    if (duplicate) return void res.status(409).json({ error: 'already_registered' });

    const createdAt = now().toISOString();
    const name = parsed.data.name || 'Passkey';
    const transports = credential.transports ?? parsed.data.response.response.transports ?? null;
    db.insert(passkeys)
      .values({
        id: credential.id,
        userId,
        name,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        transports,
        createdAt,
        lastUsedAt: null,
      })
      .run();

    res.status(201).json({
      id: credential.id,
      name,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      createdAt,
      lastUsedAt: null,
    });
  });

  router.patch('/passkey/:id', requireSession(db, now), (req, res) => {
    const parsed = renameBody.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: 'validation' });
    const id = String(req.params.id);
    const row = db
      .update(passkeys)
      .set({ name: parsed.data.name })
      .where(and(eq(passkeys.id, id), eq(passkeys.userId, req.userId!)))
      .returning({
        id: passkeys.id,
        name: passkeys.name,
        deviceType: passkeys.deviceType,
        backedUp: passkeys.backedUp,
        createdAt: passkeys.createdAt,
        lastUsedAt: passkeys.lastUsedAt,
      })
      .get();
    if (!row) return void res.status(404).json({ error: 'not_found' });
    res.json(row);
  });

  router.delete('/passkey/:id', requireSession(db, now), (req, res) => {
    const userId = req.userId!;
    const id = String(req.params.id);
    const existing = db
      .select({ id: passkeys.id })
      .from(passkeys)
      .where(and(eq(passkeys.id, id), eq(passkeys.userId, userId)))
      .get();
    if (!existing) return void res.status(404).json({ error: 'not_found' });

    const remaining = countPasskeys(db, userId) - 1;
    const allowed = (ctx.plugins ?? []).every((p) => p.canRemovePasskey?.(ctx, userId, remaining) ?? true);
    if (!allowed) return void res.status(400).json({ error: 'last_sign_in' });

    db.delete(passkeys).where(and(eq(passkeys.id, id), eq(passkeys.userId, userId))).run();
    res.status(204).end();
  });

  router.post('/passkey/login/options', limiter, async (req, res) => {
    const origin = resolveWebAuthnOrigin(config, req);
    if (!origin) return void res.status(400).json({ error: 'https_required' });
    const options = await ops.generateAuthenticationOptions({
      rpID: origin.rpID,
      userVerification: 'preferred',
    });
    const challengeToken = challenges.issue(now(), {
      challenge: options.challenge,
      kind: 'login',
      rpID: origin.rpID,
      expectedOrigin: origin.expectedOrigin,
    });
    res.json({ challengeToken, options });
  });

  router.post('/passkey/login/verify', limiter, async (req, res) => {
    const parsed = verifyLoginBody.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: 'validation' });
    const pending = challenges.consume(now(), parsed.data.challengeToken, 'login');
    if (!pending) return void res.status(400).json({ error: 'invalid_challenge' });

    const row = db.select().from(passkeys).where(eq(passkeys.id, parsed.data.response.id)).get();
    if (!row) return void res.status(401).json({ error: 'invalid_credentials' });
    if (!userAllowed(ctx, row.userId)) return void res.status(403).json({ error: 'suspended' });

    let verified;
    try {
      verified = await ops.verifyAuthenticationResponse({
        response: parsed.data.response,
        expectedChallenge: pending.challenge,
        expectedOrigin: pending.expectedOrigin,
        expectedRPID: pending.rpID,
        credential: {
          id: row.id,
          publicKey: Uint8Array.from(row.publicKey),
          counter: row.counter,
          transports: row.transports ?? undefined,
        },
        requireUserVerification: false,
      });
    } catch {
      return void res.status(401).json({ error: 'invalid_credentials' });
    }
    if (!verified.verified) return void res.status(401).json({ error: 'invalid_credentials' });

    const user = db.select().from(users).where(eq(users.id, row.userId)).get();
    if (!user) return void res.status(401).json({ error: 'invalid_credentials' });

    const { newCounter, credentialDeviceType, credentialBackedUp } = verified.authenticationInfo;
    db.update(passkeys)
      .set({
        counter: newCounter,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        lastUsedAt: now().toISOString(),
      })
      .where(eq(passkeys.id, row.id))
      .run();

    res.cookie(SESSION_COOKIE, createSession(db, user.id, now()), cookieOptions);
    for (const plugin of ctx.plugins ?? []) plugin.onSignIn?.(ctx, user.id, 'passkey');
    res.json({ id: user.id, username: user.username });
  });

  return router;
}
