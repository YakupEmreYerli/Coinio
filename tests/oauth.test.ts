import { createHash, randomBytes } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { requireBearer, type BearerVerifier } from '../src/server/auth/middleware.js';
import { createApiKey } from '../src/server/services/apiKeys.js';
import type { ServiceCtx } from '../src/server/services/context.js';
import { makeTestApp } from './helpers.js';

const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';
const mcpHeaders = { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' };

function pkcePair() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

async function setup(opts: Parameters<typeof makeTestApp>[0] = {}) {
  const t = makeTestApp(opts);
  const res = await request(t.app).post('/api/auth/setup').send({ username: 'yakup', password: 'correct horse battery' });
  const cookie = res.headers['set-cookie']![0]!.split(';')[0]!;
  const ctx: ServiceCtx = { db: t.db, config: t.config, fetch, now: () => t.clock.now };
  return { ...t, cookie, ctx };
}

type Setup = Awaited<ReturnType<typeof setup>>;

async function register(t: Setup, clientName = 'Claude') {
  const res = await request(t.app)
    .post('/register')
    .send({ redirect_uris: [REDIRECT], client_name: clientName, token_endpoint_auth_method: 'none' });
  expect(res.status).toBe(201);
  return res.body.client_id as string;
}

/** register → authorize → consent (allow) → returns the authorization code. */
async function authorize(t: Setup, opts: { scope?: string; clientName?: string } = {}) {
  const clientId = await register(t, opts.clientName);
  const { verifier, challenge } = pkcePair();
  const query: Record<string, string> = {
    response_type: 'code', client_id: clientId, redirect_uri: REDIRECT,
    code_challenge: challenge, code_challenge_method: 'S256', state: 'st-123',
  };
  if (opts.scope !== undefined) query.scope = opts.scope;
  const auth = await request(t.app).get('/authorize').query(query);
  expect(auth.status).toBe(302);
  const consentPath = auth.headers.location as string;
  expect(consentPath).toMatch(/^\/oauth\/consent\?req=/);

  const page = await request(t.app).get(consentPath).set('Cookie', t.cookie);
  expect(page.status).toBe(200);
  const reqId = /name="req" value="([^"]+)"/.exec(page.text)![1]!;
  const csrf = /name="csrf" value="([^"]+)"/.exec(page.text)![1]!;
  return { clientId, verifier, consentPath, page, reqId, csrf };
}

async function consentAndCode(t: Setup, opts: { scope?: string } = {}) {
  const a = await authorize(t, opts);
  const res = await request(t.app).post('/oauth/consent').set('Cookie', t.cookie).type('form')
    .send({ req: a.reqId, csrf: a.csrf, decision: 'allow' });
  expect(res.status).toBe(302);
  const loc = new URL(res.headers.location as string);
  expect(`${loc.origin}${loc.pathname}`).toBe(REDIRECT);
  expect(loc.searchParams.get('state')).toBe('st-123');
  return { ...a, code: loc.searchParams.get('code')! };
}

async function tokens(t: Setup, opts: { scope?: string } = {}) {
  const a = await consentAndCode(t, opts);
  const res = await request(t.app).post('/token').type('form').send({
    grant_type: 'authorization_code', code: a.code, code_verifier: a.verifier, client_id: a.clientId, redirect_uri: REDIRECT,
  });
  expect(res.status).toBe(200);
  return { ...a, body: res.body as { access_token: string; refresh_token: string; expires_in: number; scope: string } };
}

async function mcpCall(t: Setup, token: string | null, method: string, params: object = {}) {
  let r = request(t.app).post('/mcp').set(mcpHeaders);
  if (token) r = r.set('Authorization', `Bearer ${token}`);
  const res = await r.buffer(true).parse((resp, cb) => {
    let d = '';
    resp.on('data', (c) => (d += c));
    resp.on('end', () => cb(null, d));
  }).send({ jsonrpc: '2.0', id: 1, method, params });
  const raw = String(res.body);
  const json = res.status === 200 ? JSON.parse(raw.match(/data: (.*)/)?.[1] ?? raw) : null;
  return { status: res.status, headers: res.headers, json };
}

describe('oauth registration and metadata', () => {
  it('dynamic registration returns a client_id; metadata is served', async () => {
    const t = await setup();
    expect(await register(t)).toMatch(/.+/);
    const as = await request(t.app).get('/.well-known/oauth-authorization-server');
    expect(as.body).toMatchObject({ issuer: 'http://localhost:4660/', scopes_supported: ['subscriptions:read', 'subscriptions:write'] });
    const prm = await request(t.app).get('/.well-known/oauth-protected-resource/mcp');
    expect(prm.body).toMatchObject({ resource: 'http://localhost:4660/mcp' });
  });
});

describe('oauth authorization code flow', () => {
  it('runs register → authorize → consent → token with PKCE and the token lists tools on /mcp', async () => {
    const t = await setup();
    const { body } = await tokens(t);
    expect(body.expires_in).toBe(3600);
    expect(body.scope.split(' ').sort()).toEqual(['subscriptions:read', 'subscriptions:write']);
    const res = await mcpCall(t, body.access_token, 'tools/list');
    expect(res.status).toBe(200);
    expect(res.json.result.tools).toHaveLength(10);
  });

  it('sends unauthenticated consent visits to the login form', async () => {
    const t = await setup();
    const a = await authorize(t);
    const res = await request(t.app).get(a.consentPath);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/oauth/login?next=${encodeURIComponent(a.consentPath)}`);
    const login = await request(t.app).get(res.headers.location as string);
    expect(login.status).toBe(200);
    expect(login.text).toContain('<form');
  });

  it('escapes the client name on the consent page and shows requested scopes', async () => {
    const t = await setup();
    const a = await authorize(t, { clientName: '<script>alert(1)</script>', scope: 'subscriptions:read' });
    expect(a.page.text).not.toContain('<script>alert(1)</script>');
    expect(a.page.text).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(a.page.text).toContain('subscriptions:read');
    expect(a.page.headers['x-frame-options']).toBe('DENY');
  });

  it('rejects a consent POST with a wrong CSRF token, and deny redirects with access_denied', async () => {
    const t = await setup();
    const a = await authorize(t);
    const bad = await request(t.app).post('/oauth/consent').set('Cookie', t.cookie).type('form')
      .send({ req: a.reqId, csrf: 'nope', decision: 'allow' });
    expect(bad.status).toBe(403);
    const deny = await request(t.app).post('/oauth/consent').set('Cookie', t.cookie).type('form')
      .send({ req: a.reqId, csrf: a.csrf, decision: 'deny' });
    expect(deny.status).toBe(302);
    const loc = new URL(deny.headers.location as string);
    expect(loc.searchParams.get('error')).toBe('access_denied');
    expect(loc.searchParams.get('state')).toBe('st-123');
  });

  it('rejects unknown scopes at authorize', async () => {
    const t = await setup();
    const clientId = await register(t);
    const { challenge } = pkcePair();
    const res = await request(t.app).get('/authorize').query({
      response_type: 'code', client_id: clientId, redirect_uri: REDIRECT, code_challenge: challenge,
      code_challenge_method: 'S256', scope: 'admin',
    });
    expect(res.status).toBe(302);
    expect(new URL(res.headers.location as string).searchParams.get('error')).toBe('invalid_scope');
  });

  it('wrong code_verifier → invalid_grant; a code cannot be used twice', async () => {
    const t = await setup();
    const a = await consentAndCode(t);
    const wrong = await request(t.app).post('/token').type('form').send({
      grant_type: 'authorization_code', code: a.code, code_verifier: pkcePair().verifier, client_id: a.clientId,
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error).toBe('invalid_grant');
    const form = { grant_type: 'authorization_code', code: a.code, code_verifier: a.verifier, client_id: a.clientId };
    expect((await request(t.app).post('/token').type('form').send(form)).status).toBe(200);
    const again = await request(t.app).post('/token').type('form').send(form);
    expect(again.body.error).toBe('invalid_grant');
  });

  it('expired codes are rejected', async () => {
    const t = await setup();
    const a = await consentAndCode(t);
    t.clock.set(new Date(t.clock.now.getTime() + 11 * 60 * 1000));
    const res = await request(t.app).post('/token').type('form').send({
      grant_type: 'authorization_code', code: a.code, code_verifier: a.verifier, client_id: a.clientId,
    });
    expect(res.body.error).toBe('invalid_grant');
  });

  it('refresh token issues a new access token and is rotated', async () => {
    const t = await setup();
    const { body, clientId } = await tokens(t);
    const form = { grant_type: 'refresh_token', refresh_token: body.refresh_token, client_id: clientId };
    const res = await request(t.app).post('/token').type('form').send(form);
    expect(res.status).toBe(200);
    expect(res.body.access_token).not.toBe(body.access_token);
    expect(res.body.refresh_token).not.toBe(body.refresh_token);
    expect((await mcpCall(t, res.body.access_token, 'tools/list')).status).toBe(200);
    const reused = await request(t.app).post('/token').type('form').send(form);
    expect(reused.body.error).toBe('invalid_grant');
  });

  it('access tokens expire after one hour', async () => {
    const t = await setup();
    const { body } = await tokens(t);
    t.clock.set(new Date(t.clock.now.getTime() + 61 * 60 * 1000));
    expect((await mcpCall(t, body.access_token, 'tools/list')).status).toBe(401);
  });

  it('read-only scope maps to read tools', async () => {
    const t = await setup();
    const { body } = await tokens(t, { scope: 'subscriptions:read' });
    expect((await mcpCall(t, body.access_token, 'tools/list')).json.result.tools).toHaveLength(4);
  });

  it('a token requested without scope can call mark_paid', async () => {
    const t = await setup();
    const sub = await request(t.app).post('/api/subscriptions').set('Cookie', t.cookie).send({
      name: 'Netflix', amountMinor: 19999, currency: 'TRY', cycle: 'monthly', intervalCount: 1, nextDue: '2026-12-31',
    });
    expect(sub.status).toBe(201);
    const { body } = await tokens(t);
    const res = await mcpCall(t, body.access_token, 'tools/call', { name: 'mark_paid', arguments: { id: sub.body.id } });
    expect(res.status).toBe(200);
    expect(res.json.result.isError).toBeFalsy();
    expect(JSON.parse(res.json.result.content[0].text).payment).toMatchObject({ due_date: '2026-12-31' });
  });

  it('the /revoke endpoint revokes an access token', async () => {
    const t = await setup();
    const { body, clientId } = await tokens(t);
    const res = await request(t.app).post('/revoke').type('form').send({ token: body.access_token, client_id: clientId });
    expect(res.status).toBe(200);
    expect((await mcpCall(t, body.access_token, 'tools/list')).status).toBe(401);
  });
});

describe('connected clients API', () => {
  it('lists connected clients and revoking one makes its access token 401', async () => {
    const t = await setup();
    const { body, clientId } = await tokens(t);
    await mcpCall(t, body.access_token, 'tools/list');
    const list = await request(t.app).get('/api/oauth/clients').set('Cookie', t.cookie);
    expect(list.status).toBe(200);
    expect(list.body).toEqual([{
      clientId, clientName: 'Claude', createdAt: '2026-11-18T09:00:00.000Z', lastUsedAt: '2026-11-18T09:00:00.000Z', activeTokenCount: 2,
    }]);
    expect((await request(t.app).get('/api/oauth/clients')).status).toBe(401);

    expect((await request(t.app).delete(`/api/oauth/clients/${clientId}`).set('Cookie', t.cookie)).status).toBe(204);
    expect((await mcpCall(t, body.access_token, 'tools/list')).status).toBe(401);
    expect((await request(t.app).get('/api/oauth/clients').set('Cookie', t.cookie)).body).toEqual([]);
    expect((await request(t.app).delete(`/api/oauth/clients/${clientId}`).set('Cookie', t.cookie)).status).toBe(404);
  });
});

describe('/mcp bearer challenge', () => {
  it('unauthenticated /mcp → 401 with resource_metadata pointing at the protected resource metadata', async () => {
    const t = await setup();
    for (const token of [null, 'bogus']) {
      const res = await mcpCall(t, token, 'tools/list');
      expect(res.status).toBe(401);
      expect(res.headers['www-authenticate']).toContain(
        'resource_metadata="http://localhost:4660/.well-known/oauth-protected-resource/mcp"',
      );
    }
  });

  it('without a public URL, OAuth routes are not mounted and API keys still work', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = await setup({ config: { publicUrl: null } });
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
    expect((await request(t.app).get('/.well-known/oauth-authorization-server')).status).toBe(404);
    expect((await request(t.app).post('/register').send({ redirect_uris: [REDIRECT] })).status).toBe(404);
    const unauth = await mcpCall(t, null, 'tools/list');
    expect(unauth.status).toBe(401);
    expect(unauth.headers['www-authenticate']).toBeUndefined();
    const { key } = createApiKey(t.ctx, 1, 'k', 'read');
    expect((await mcpCall(t, key, 'tools/list')).status).toBe(200);
  });
});

describe('requireBearer verifiers', () => {
  const appWith = (t: Setup, v: BearerVerifier) => {
    const app = express();
    app.get('/x', requireBearer(t.ctx, ['read'], [v]), (_req, res) => { res.json({ ok: true }); });
    return app;
  };

  it('awaits async verifiers', async () => {
    const t = await setup();
    const v: BearerVerifier = async (_ctx, raw) =>
      raw === 'good' ? { token: raw, clientId: 'c', scopes: [], extra: { userId: 1, scope: 'read', via: 'oauth' } } : null;
    expect((await request(appWith(t, v)).get('/x').set('Authorization', 'Bearer good')).status).toBe(200);
    expect((await request(appWith(t, v)).get('/x').set('Authorization', 'Bearer bad')).status).toBe(401);
  });

  it('a verifier result without a valid principal is a 401 invalid_token, not a 500', async () => {
    const t = await setup();
    const v: BearerVerifier = () => ({ token: 'x', clientId: 'c', scopes: [] });
    const res = await request(appWith(t, v)).get('/x').set('Authorization', 'Bearer x');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_token');
  });
});
