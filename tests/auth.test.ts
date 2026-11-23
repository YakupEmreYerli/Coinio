import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { makeTestApp } from './helpers.js';
import { requireSession } from '../src/server/auth/middleware.js';

const creds = { username: 'yakup', password: 'correct horse battery' };

async function setup(t = makeTestApp()) {
  const res = await request(t.app).post('/api/auth/setup').send(creds);
  const cookie = (res.headers['set-cookie'] as unknown as string[] | undefined)?.[0] ?? '';
  return { ...t, res, cookie };
}

describe('auth', () => {
  it('reports setupRequired before setup', async () => {
    const { app } = makeTestApp();
    const res = await request(app).get('/api/auth/state');
    expect(res.body).toEqual({ setupRequired: true, user: null });
  });

  it('setup creates the user and a session cookie', async () => {
    const { res, cookie, app } = await setup();
    expect(res.status).toBe(201);
    expect(cookie).toMatch(/^sid=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).not.toMatch(/Secure/i);
    const state = await request(app).get('/api/auth/state').set('Cookie', cookie);
    expect(state.body).toEqual({ setupRequired: false, user: { id: 1, username: 'yakup' } });
  });

  it('sets Secure cookie based on request protocol or X-Forwarded-Proto, not publicUrl', async () => {
    const plain = await setup(makeTestApp({ config: { publicUrl: 'https://subs.example.com' } }));
    expect(plain.cookie).not.toMatch(/Secure/i);

    const proxied = makeTestApp({ config: { publicUrl: 'https://subs.example.com' } });
    const res = await request(proxied.app).post('/api/auth/setup').set('X-Forwarded-Proto', 'https').send(creds);
    const proxiedCookie = (res.headers['set-cookie'] as unknown as string[] | undefined)?.[0] ?? '';
    expect(proxiedCookie).toMatch(/Secure/i);
  });

  it('second setup returns 409', async () => {
    const { app } = await setup();
    const res = await request(app).post('/api/auth/setup').send({ username: 'other', password: 'another long pass' });
    expect(res.status).toBe(409);
  });

  it('rejects a 9 character password', async () => {
    const { app } = makeTestApp();
    const res = await request(app).post('/api/auth/setup').send({ username: 'yakup', password: '123456789' });
    expect(res.status).toBe(400);
  });

  it('login works with the right password and fails with a wrong one', async () => {
    const { app } = await setup();
    const bad = await request(app).post('/api/auth/login').send({ ...creds, password: 'wrong password!!' });
    expect(bad.status).toBe(401);
    const unknown = await request(app).post('/api/auth/login').send({ username: 'nobody', password: 'wrong password!!' });
    expect(unknown.status).toBe(401);
    const ok = await request(app).post('/api/auth/login').send(creds);
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ id: 1, username: 'yakup' });
    expect(ok.headers['set-cookie']?.[0]).toMatch(/^sid=/);
  });

  it('returns 429 on the 11th failed login', async () => {
    const { app } = await setup();
    for (let i = 0; i < 10; i++) {
      const r = await request(app).post('/api/auth/login').send({ ...creds, password: 'wrong password!!' });
      expect(r.status).toBe(401);
    }
    const res = await request(app).post('/api/auth/login').send({ ...creds, password: 'wrong password!!' });
    expect(res.status).toBe(429);
  });

  it('logout clears the session', async () => {
    const { app, cookie } = await setup();
    const out = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(out.status).toBe(204);
    const state = await request(app).get('/api/auth/state').set('Cookie', cookie);
    expect(state.body.user).toBeNull();
  });

  it('session expires after 30 days', async () => {
    const { app, cookie, clock } = await setup();
    clock.set('2026-12-17T08:59:00Z');
    expect((await request(app).get('/api/auth/state').set('Cookie', cookie)).body.user).not.toBeNull();
    clock.set('2026-12-18T09:00:01Z');
    expect((await request(app).get('/api/auth/state').set('Cookie', cookie)).body.user).toBeNull();
  });

  it('requireSession returns 401 without a session', async () => {
    const { app } = makeTestApp();
    expect(typeof requireSession).toBe('function');
    const res = await request(app).post('/api/auth/logout');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });
});

describe('password change', () => {
  async function setup() {
    const t = makeTestApp();
    const a = request.agent(t.app);
    await a.post('/api/auth/setup').send({ username: 'yakup', password: 'correct horse battery' });
    return { ...t, a };
  }

  it('password change with wrong current → 403', async () => {
    const { a } = await setup();
    const res = await a.post('/api/auth/password').send({ current: 'wrong password!', next: 'new password 123' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('wrong_password');
  });

  it('password change ends other sessions and new password works', async () => {
    const { app, a } = await setup();
    const b = request.agent(app);
    await b.post('/api/auth/login').send({ username: 'yakup', password: 'correct horse battery' });
    expect((await b.get('/api/auth/state')).body.user).not.toBeNull();
    expect((await a.post('/api/auth/password').send({ current: 'correct horse battery', next: 'new password 123' })).status).toBe(204);
    expect((await b.get('/api/auth/state')).body.user).toBeNull();
    expect((await a.get('/api/auth/state')).body.user).not.toBeNull();
    expect((await request(app).post('/api/auth/login').send({ username: 'yakup', password: 'new password 123' })).status).toBe(200);
  });

  it('rejects a too short new password', async () => {
    const { a } = await setup();
    expect((await a.post('/api/auth/password').send({ current: 'correct horse battery', next: 'short' })).status).toBe(400);
  });
});
