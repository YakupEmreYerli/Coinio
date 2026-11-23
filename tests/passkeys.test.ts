import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/server/app.js';
import type { PasskeyOps } from '../src/server/auth/passkeys.js';
import { SESSION_COOKIE } from '../src/server/auth/sessions.js';
import { passkeys } from '../src/server/db/schema.js';
import type { CoinioPlugin } from '../src/server/plugins.js';
import { passkeyRouter } from '../src/server/routes/passkeys.js';
import { addUser, makeTestApp } from './helpers.js';

function fakeWebAuthnOps(): PasskeyOps {
  let seq = 0;
  return {
    generateRegistrationOptions: async (opts) => ({
      rp: { id: opts.rpID, name: opts.rpName },
      user: { id: 'MQ', name: opts.userName, displayName: opts.userDisplayName ?? opts.userName },
      challenge: `reg-chal-${++seq}`,
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      excludeCredentials: opts.excludeCredentials as never,
    }),
    verifyRegistrationResponse: async ({ response, expectedChallenge }) => {
      if (response.response.clientDataJSON !== expectedChallenge) {
        return { verified: false };
      }
      return {
        verified: true,
        registrationInfo: {
          fmt: 'none',
          aaguid: '00000000-0000-0000-0000-000000000000',
          credential: {
            id: response.id,
            publicKey: new Uint8Array([1, 2, 3, 4]),
            counter: 1,
            transports: ['internal'],
          },
          credentialType: 'public-key',
          attestationObject: new Uint8Array([0]),
          userVerified: true,
          credentialDeviceType: 'multiDevice',
          credentialBackedUp: true,
          origin: 'http://localhost:4660',
          rpID: 'localhost',
        },
      };
    },
    generateAuthenticationOptions: async (opts) => ({
      challenge: `auth-chal-${++seq}`,
      rpId: opts.rpID,
    }),
    verifyAuthenticationResponse: async ({ response, expectedChallenge, credential }) => ({
      verified: response.response.clientDataJSON === expectedChallenge,
      authenticationInfo: {
        credentialID: credential.id,
        newCounter: credential.counter + 1,
        userVerified: true,
        credentialDeviceType: 'multiDevice',
        credentialBackedUp: true,
        origin: 'http://localhost:4660',
        rpID: 'localhost',
      },
    }),
  };
}

function makePasskeyTestApp(opts: { config?: { publicUrl?: string }; plugins?: CoinioPlugin[] } = {}) {
  const t = makeTestApp({ config: opts.config });
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  const ops = fakeWebAuthnOps();
  const ctx = { db: t.db, config: t.config, fetch, now: () => t.clock.now, plugins: opts.plugins };
  app.use('/api/auth', passkeyRouter(ctx, ops));
  return { ...t, app };
}

describe('passkey origins and status', () => {
  it('supports localhost and https, and rejects plain LAN HTTP', async () => {
    const local = makeTestApp({ config: { publicUrl: 'http://localhost:4660' } });
    expect((await request(local.app).get('/api/auth/passkey/status').expect(200)).body).toEqual({ supported: true });

    const https = makeTestApp({ config: { publicUrl: 'https://coinio.example.com' } });
    expect((await request(https.app).get('/api/auth/passkey/status').expect(200)).body).toEqual({ supported: true });

    const lan = makeTestApp({ config: { publicUrl: 'http://192.168.1.25:8080' } });
    expect((await request(lan.app).get('/api/auth/passkey/status').expect(200)).body).toEqual({ supported: false });
    const a = addUser(lan, 'yakup');
    expect((await a.agent.post('/api/auth/passkey/register/options').expect(400)).body).toEqual({ error: 'https_required' });
    expect((await request(lan.app).post('/api/auth/passkey/login/options').expect(400)).body).toEqual({ error: 'https_required' });
  });

  it('infers localhost vs LAN from Host/Origin when publicUrl is unset', async () => {
    const t = makeTestApp({ config: { publicUrl: undefined } });
    expect((await request(t.app).get('/api/auth/passkey/status').set('Host', 'localhost:8080').expect(200)).body).toEqual({ supported: true });
    expect((await request(t.app).get('/api/auth/passkey/status').set('Host', '192.168.1.50:8080').expect(200)).body).toEqual({ supported: false });
  });
});

describe('passkey registration, management and sign-in', () => {
  const regPayload = (id: string, challenge: string) => ({
    id,
    rawId: id,
    type: 'public-key',
    clientExtensionResults: {},
    response: {
      clientDataJSON: challenge,
      attestationObject: 'x',
      transports: ['internal'],
    },
  });

  const authPayload = (id: string, challenge: string) => ({
    id,
    rawId: id,
    type: 'public-key',
    clientExtensionResults: {},
    response: {
      clientDataJSON: challenge,
      authenticatorData: 'x',
      signature: 'x',
    },
  });

  it('registers, lists without publicKey, renames and signs in with replay + counter checks', async () => {
    const onSignIn = vi.fn();
    const t = makePasskeyTestApp({ plugins: [{ name: 'audit', onSignIn }] });
    const u = addUser(t, 'yakup');

    const optRes = await u.agent.post('/api/auth/passkey/register/options').expect(200);
    const verRes = await u.agent
      .post('/api/auth/passkey/register/verify')
      .send({
        challengeToken: optRes.body.challengeToken,
        name: 'MacBook Touch ID',
        response: regPayload('cred-1', optRes.body.options.challenge),
      })
      .expect(201);

    expect(verRes.body).toMatchObject({ id: 'cred-1', name: 'MacBook Touch ID', backedUp: true });
    expect('publicKey' in verRes.body).toBe(false);

    const listRes = await u.agent.get('/api/auth/passkeys').expect(200);
    expect(listRes.body.passkeys).toHaveLength(1);
    expect('publicKey' in listRes.body.passkeys[0]).toBe(false);

    await u.agent.patch('/api/auth/passkey/cred-1').send({ name: 'Work Laptop' }).expect(200);
    expect((await u.agent.get('/api/auth/passkeys')).body.passkeys[0].name).toBe('Work Laptop');

    // Replay of registration challenge fails.
    await u.agent
      .post('/api/auth/passkey/register/verify')
      .send({ challengeToken: optRes.body.challengeToken, response: regPayload('cred-2', optRes.body.options.challenge) })
      .expect(400);

    // Login with passkey succeeds, sets session cookie, advances counter, and triggers onSignIn.
    t.clock.set('2026-11-18T10:00:00Z');
    const loginOpt = await request(t.app).post('/api/auth/passkey/login/options').expect(200);
    const loginVer = await request(t.app)
      .post('/api/auth/passkey/login/verify')
      .send({ challengeToken: loginOpt.body.challengeToken, response: authPayload('cred-1', loginOpt.body.options.challenge) })
      .expect(200);

    expect(loginVer.body).toEqual({ id: u.id, username: 'yakup' });
    expect(loginVer.headers['set-cookie']?.[0]).toMatch(new RegExp(`^${SESSION_COOKIE}=`));
    expect(onSignIn).toHaveBeenCalledWith(expect.anything(), u.id, 'passkey');

    const stored = t.db.select().from(passkeys).all()[0]!;
    expect(stored.counter).toBe(2);
    expect(stored.lastUsedAt).toBe('2026-11-18T10:00:00.000Z');

    // Replay of login challenge fails.
    await request(t.app)
      .post('/api/auth/passkey/login/verify')
      .send({ challengeToken: loginOpt.body.challengeToken, response: authPayload('cred-1', loginOpt.body.options.challenge) })
      .expect(400);
  });

  it('enforces the 10-passkey limit and prevents deleting or renaming another user passkey', async () => {
    const t = makePasskeyTestApp();
    const u1 = addUser(t, 'u1');
    const u2 = addUser(t, 'u2');

    for (let i = 0; i < 10; i++) {
      const o = await u1.agent.post('/api/auth/passkey/register/options').expect(200);
      await u1.agent
        .post('/api/auth/passkey/register/verify')
        .send({ challengeToken: o.body.challengeToken, response: regPayload(`c-${i}`, o.body.options.challenge) })
        .expect(201);
    }

    const over = await u1.agent.post('/api/auth/passkey/register/options').expect(400);
    expect(over.body).toEqual({ error: 'limit_reached', limit: 10 });

    await u2.agent.patch('/api/auth/passkey/c-0').send({ name: 'Hijack' }).expect(404);
    await u2.agent.delete('/api/auth/passkey/c-0').expect(404);
  });

  it('respects allowUser and canRemovePasskey plugin hooks', async () => {
    let allow = true;
    const t = makePasskeyTestApp({
      plugins: [
        {
          name: 'guard',
          allowUser: () => allow,
          canRemovePasskey: (_ctx, _id, remaining) => remaining > 0,
        },
      ],
    });
    const u = addUser(t, 'yakup');

    const o = await u.agent.post('/api/auth/passkey/register/options').expect(200);
    await u.agent
      .post('/api/auth/passkey/register/verify')
      .send({ challengeToken: o.body.challengeToken, response: regPayload('only-key', o.body.options.challenge) })
      .expect(201);

    const del = await u.agent.delete('/api/auth/passkey/only-key').expect(400);
    expect(del.body).toEqual({ error: 'last_sign_in' });

    allow = false;
    const lo = await request(t.app).post('/api/auth/passkey/login/options').expect(200);
    const lv = await request(t.app)
      .post('/api/auth/passkey/login/verify')
      .send({ challengeToken: lo.body.challengeToken, response: authPayload('only-key', lo.body.options.challenge) })
      .expect(403);
    expect(lv.body).toEqual({ error: 'suspended' });
  });

  it('mounts passkey routes on full createApp and generates real WebAuthn options', async () => {
    const t = makeTestApp();
    const u = addUser(t, 'yakup');
    const reg = await u.agent.post('/api/auth/passkey/register/options').expect(200);
    expect(reg.body.options.rp.id).toBe('localhost');
    expect(typeof reg.body.challengeToken).toBe('string');
    const login = await request(t.app).post('/api/auth/passkey/login/options').expect(200);
    expect(login.body.options.rpId).toBe('localhost');
    expect(createApp).toBeDefined();
  });
});
