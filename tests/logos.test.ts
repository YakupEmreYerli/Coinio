import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { waitForLogoFetches } from '../src/server/services/logos.js';
import { makeTestApp } from './helpers.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const sub = { name: 'Netflix', amountMinor: 100, currency: 'TRY', cycle: 'monthly', intervalCount: 1, nextDue: '2026-12-31', domain: 'streamco.com' };

const png = (): Response => new Response(PNG, { status: 200, headers: { 'content-type': 'image/png' } });
const isDdg = (u: unknown) => String(u).startsWith('https://icons.duckduckgo.com/');
/** Only DuckDuckGo answers, so these tests exercise the last fallback of the logo pool. */
const ddgOnly = (answer: () => Response | Promise<Response>) =>
  (async (u: string) => (isDdg(u) ? answer() : new Response('', { status: 404 }))) as unknown as typeof fetch;

async function login(fetchFn: typeof fetch) {
  const t = makeTestApp({ fetch: fetchFn });
  const agent = request.agent(t.app);
  await agent.post('/api/auth/setup').send({ username: 'yakup', password: 'correct horse battery' });
  return { ...t, agent };
}
const logoFiles = (dir: string) => (existsSync(join(dir, 'logos')) ? readdirSync(join(dir, 'logos')) : []);

describe('logo auto-fetch', () => {
  it('stores a fetched PNG and fills logoPath', async () => {
    const urls: string[] = [];
    const { agent, app, config } = await login((async (u: string) => (urls.push(String(u)), isDdg(u) ? png() : new Response('', { status: 404 }))) as unknown as typeof fetch);
    const created = await agent.post('/api/subscriptions').send(sub);
    expect(created.status).toBe(201);
    await waitForLogoFetches();
    expect(urls.at(-1)).toBe('https://icons.duckduckgo.com/ip3/streamco.com.ico');
    const got = (await agent.get(`/api/subscriptions/${created.body.id}`)).body;
    expect(got.logoPath).toMatch(/^[0-9a-f]{40}\.png$/);
    expect(logoFiles(config.dataDir)).toEqual([got.logoPath]);
    const file = await request(app).get(`/logos/${got.logoPath}`);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('image/png');
  });

  it('a 404 leaves logoPath null and the subscription saved', async () => {
    const { agent } = await login((async () => new Response('', { status: 404 })) as unknown as typeof fetch);
    const created = await agent.post('/api/subscriptions').send(sub);
    await waitForLogoFetches();
    expect(created.status).toBe(201);
    expect((await agent.get(`/api/subscriptions/${created.body.id}`)).body.logoPath).toBeNull();
  });

  it('a throwing fetch never fails the save', async () => {
    const { agent } = await login((async () => { throw new Error('offline'); }) as unknown as typeof fetch);
    const created = await agent.post('/api/subscriptions').send(sub);
    await waitForLogoFetches();
    expect(created.status).toBe(201);
  });

  it('rejects a 2 MB response', async () => {
    const big = Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]);
    const { agent, config } = await login(ddgOnly(() => new Response(big, { headers: { 'content-type': 'image/png' } })));
    const created = await agent.post('/api/subscriptions').send(sub);
    await waitForLogoFetches();
    expect((await agent.get(`/api/subscriptions/${created.body.id}`)).body.logoPath).toBeNull();
    expect(logoFiles(config.dataDir)).toEqual([]);
  });

  it('rejects non-image content types', async () => {
    const { agent } = await login(ddgOnly(() => new Response('<html>', { headers: { 'content-type': 'text/html' } })));
    const created = await agent.post('/api/subscriptions').send(sub);
    await waitForLogoFetches();
    expect((await agent.get(`/api/subscriptions/${created.body.id}`)).body.logoPath).toBeNull();
  });

  it('refetches only when the domain changes', async () => {
    let calls = 0;
    const { agent } = await login(ddgOnly(() => (calls++, png())));
    const created = await agent.post('/api/subscriptions').send(sub);
    await waitForLogoFetches();
    await agent.patch(`/api/subscriptions/${created.body.id}`).send({ name: 'Netflix 2', domain: 'streamco.com' });
    await waitForLogoFetches();
    expect(calls).toBe(1);
    await agent.patch(`/api/subscriptions/${created.body.id}`).send({ domain: 'example.org' });
    await waitForLogoFetches();
    expect(calls).toBe(2);
  });

  it('keeps a shared domain logo when another subscription replaces or changes its own', async () => {
    const { agent, app, config } = await login(ddgOnly(png));
    const a = (await agent.post('/api/subscriptions').send(sub)).body.id;
    const b = (await agent.post('/api/subscriptions').send({ ...sub, name: 'Netflix 2' })).body.id;
    await waitForLogoFetches();
    const shared = (await agent.get(`/api/subscriptions/${b}`)).body.logoPath;
    expect((await agent.get(`/api/subscriptions/${a}`)).body.logoPath).toBe(shared);
    await agent.post(`/api/subscriptions/${a}/logo`).attach('logo', PNG, { filename: 'a.png', contentType: 'image/png' });
    expect(logoFiles(config.dataDir)).toContain(shared);
    expect((await request(app).get(`/logos/${shared}`)).status).toBe(200);
    await agent.patch(`/api/subscriptions/${b}`).send({ domain: 'example.org' });
    await waitForLogoFetches();
    expect((await agent.get(`/api/subscriptions/${b}`)).body.logoPath).not.toBe(shared);
  });

  it('refuses redirects', async () => {
    let init: RequestInit | undefined;
    const { agent } = await login((async (u: string, i?: RequestInit) => (isDdg(u) ? ((init = i), png()) : new Response('', { status: 404 }))) as unknown as typeof fetch);
    await agent.post('/api/subscriptions').send(sub);
    await waitForLogoFetches();
    expect(init?.redirect).toBe('error');
  });

  it('rejects invalid domains with 400', async () => {
    const { agent } = await login(fetch);
    for (const domain of ['../../etc', 'a/b', 'a..b', 'exa mple.com', '-a.com', `${'a'.repeat(250)}.com`]) {
      const res = await agent.post('/api/subscriptions').send({ ...sub, domain });
      expect(res.status, domain).toBe(400);
    }
  });
});

describe('logo upload and serving', () => {
  const noFetch = (async () => new Response('', { status: 404 })) as unknown as typeof fetch;

  it('uploads a PNG, replaces it and deletes the old file', async () => {
    const { agent, config } = await login(noFetch);
    const id = (await agent.post('/api/subscriptions').send({ ...sub, domain: undefined })).body.id;
    const first = await agent.post(`/api/subscriptions/${id}/logo`).attach('logo', PNG, { filename: 'a.png', contentType: 'image/png' });
    expect(first.status).toBe(200);
    expect(first.body.logoPath).toMatch(/\.png$/);
    const second = Buffer.concat([PNG, Buffer.from('x')]);
    const res = await agent.post(`/api/subscriptions/${id}/logo`).attach('logo', second, { filename: 'b.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(logoFiles(config.dataDir)).toEqual([res.body.logoPath]);
  });

  it('requires a session and ownership', async () => {
    const { agent, app } = await login(noFetch);
    const id = (await agent.post('/api/subscriptions').send(sub)).body.id;
    expect((await request(app).post(`/api/subscriptions/${id}/logo`).attach('logo', PNG, { filename: 'a.png', contentType: 'image/png' })).status).toBe(401);
    expect((await agent.post('/api/subscriptions/9999/logo').attach('logo', PNG, { filename: 'a.png', contentType: 'image/png' })).status).toBe(404);
  });

  it('rejects oversize, wrong magic bytes, wrong type and missing file', async () => {
    const { agent } = await login(noFetch);
    const id = (await agent.post('/api/subscriptions').send(sub)).body.id;
    const post = () => agent.post(`/api/subscriptions/${id}/logo`);
    expect((await post().attach('logo', Buffer.concat([PNG, Buffer.alloc(600 * 1024)]), { filename: 'a.png', contentType: 'image/png' })).status).toBe(413);
    expect((await post().attach('logo', Buffer.from('not an image at all'), { filename: 'a.png', contentType: 'image/png' })).status).toBe(400);
    expect((await post().attach('logo', PNG, { filename: 'a.txt', contentType: 'text/plain' })).status).toBe(400);
    expect((await post().send({})).status).toBe(400);
  });

  it('serves SVG with a locked-down CSP', async () => {
    const { agent, app } = await login(noFetch);
    const id = (await agent.post('/api/subscriptions').send(sub)).body.id;
    const svg = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const up = await agent.post(`/api/subscriptions/${id}/logo`).attach('logo', svg, { filename: 'a.svg', contentType: 'image/svg+xml' });
    expect(up.status).toBe(200);
    const res = await request(app).get(`/logos/${up.body.logoPath}`);
    expect(res.headers['content-security-policy']).toBe("default-src 'none'; style-src 'unsafe-inline'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-type']).toContain('image/svg+xml');
  });

  it('refuses bad file names', async () => {
    const { app } = await login(noFetch);
    expect((await request(app).get('/logos/..%2F..%2Fetc%2Fpasswd')).status).toBe(404);
    expect((await request(app).get('/logos/nothere.png')).status).toBe(404);
    expect((await request(app).get('/logos/abc.exe')).status).toBe(404);
  });
});
