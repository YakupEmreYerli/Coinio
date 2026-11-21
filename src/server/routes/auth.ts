import { count, eq } from 'drizzle-orm';
import { Router, type CookieOptions } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { requireSession } from '../auth/middleware.js';
import { burnPasswordCheck, hashPassword, verifyPassword } from '../auth/password.js';
import { SESSION_COOKIE, SESSION_TTL_MS, createSession, deleteOtherSessions, deleteSession, findSessionUserId } from '../auth/sessions.js';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { users } from '../db/schema.js';
import { seedTelegramFromEnv } from '../services/notify/channels.js';
import { userAllowed, type CoinioPlugin } from '../plugins.js';

const credentials = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(10).max(1000),
});

export function authRouter(deps: { db: Db; config: Config; now: () => Date; plugins?: CoinioPlugin[] }): Router {
  const { db, config, now } = deps;
  const ctx = { db, config, now, fetch, plugins: deps.plugins };
  const router = Router();

  const cookieOptions: CookieOptions = {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.publicUrl?.startsWith('https://') ?? false,
    maxAge: SESSION_TTL_MS,
    path: '/',
  };

  // Counts failed attempts only (successful requests are skipped), per IP.
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

  const userCount = () => db.select({ n: count() }).from(users).get()?.n ?? 0;

  router.get('/state', (req, res) => {
    const sid = req.cookies?.[SESSION_COOKIE];
    const userId = typeof sid === 'string' ? findSessionUserId(db, sid, now()) : null;
    // A user a plugin rejects counts as signed out here, or the app would bounce between screens.
    const allowed = userId !== null && userAllowed(ctx, userId);
    const user = allowed ? db.select().from(users).where(eq(users.id, userId)).get() : undefined;
    res.json({
      setupRequired: userCount() === 0,
      user: user ? { id: user.id, username: user.username } : null,
    });
  });

  router.post('/setup', limiter, async (req, res) => {
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_credentials' });
      return;
    }
    if (userCount() > 0) {
      res.status(409).json({ error: 'already_setup' });
      return;
    }
    const passwordHash = await hashPassword(parsed.data.password);
    // No await between the re-check and the insert, so concurrent setups cannot both succeed.
    if (userCount() > 0) {
      res.status(409).json({ error: 'already_setup' });
      return;
    }
    const user = db
      .insert(users)
      .values({ username: parsed.data.username, passwordHash, createdAt: now().toISOString() })
      .returning()
      .get();
    seedTelegramFromEnv({ db, config, now, fetch });
    res.cookie(SESSION_COOKIE, createSession(db, user.id, now()), cookieOptions);
    res.status(201).json({ id: user.id, username: user.username });
  });

  router.post('/login', limiter, async (req, res) => {
    const parsed = z.object({ username: z.string(), password: z.string() }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'invalid_credentials' });
      return;
    }
    const user = db.select().from(users).where(eq(users.username, parsed.data.username.trim())).get();
    if (!user) {
      await burnPasswordCheck(parsed.data.password);
    }
    if (!user || !(await verifyPassword(user.passwordHash, parsed.data.password))) {
      res.status(401).json({ error: 'invalid_credentials' });
      return;
    }
    res.cookie(SESSION_COOKIE, createSession(db, user.id, now()), cookieOptions);
    res.json({ id: user.id, username: user.username });
  });

  router.post('/password', limiter, requireSession(db, now), async (req, res) => {
    const parsed = z.object({ current: z.string().max(200), next: z.string().min(10).max(200) }).safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'validation' });
      return;
    }
    const user = db.select().from(users).where(eq(users.id, req.userId!)).get();
    if (!user || !(await verifyPassword(user.passwordHash, parsed.data.current))) {
      res.status(403).json({ error: 'wrong_password' });
      return;
    }
    db.update(users).set({ passwordHash: await hashPassword(parsed.data.next) }).where(eq(users.id, user.id)).run();
    deleteOtherSessions(db, user.id, req.cookies[SESSION_COOKIE]);
    res.status(204).end();
  });

  router.post('/logout', requireSession(db, now), (req, res) => {
    deleteSession(db, req.cookies[SESSION_COOKIE]);
    res.clearCookie(SESSION_COOKIE, { ...cookieOptions, maxAge: undefined });
    res.status(204).end();
  });

  return router;
}
