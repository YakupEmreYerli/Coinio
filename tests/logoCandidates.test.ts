import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { discoverSiteIcons, fetchBestLogo, findBrands, imageWidth } from '../src/server/services/logoCandidates.js';
import type { LookupFn, ServiceCtx } from '../src/server/services/context.js';
import { waitForLogoFetches } from '../src/server/services/logos.js';
import { makeTestApp, publicLookup } from './helpers.js';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const png = () => new Response(PNG, { headers: { 'content-type': 'image/png' } });
const html = (body: string) => new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });
const notFound = () => new Response('', { status: 404 });

const ACME_HTML = `<!doctype html><html><head>
  <link rel="icon" href="/favicon-32.png" sizes="32x32">
  <link rel="apple-touch-icon" href="/apple.png" sizes="180x180">
  <link rel="manifest" href="/m.json">
  <link rel="icon" href="https://internal.corp/x.png" sizes="256x256">
</head><body></body></html>`;

/** acme.com serves a page with icons; internal.corp resolves to a private address. */
function acmeFetch(seen: string[] = []) {
  return (async (u: string) => {
    const url = String(u);
    seen.push(url);
    if (url === 'https://acme.com/') return html(ACME_HTML);
    if (url === 'https://acme.com/m.json') return new Response(JSON.stringify({ icons: [{ src: '/icon-512.png', sizes: '512x512' }] }), { headers: { 'content-type': 'application/json' } });
    if (url.startsWith('https://acme.com/') || url.startsWith('https://icons.duckduckgo.com/')) return png();
    return notFound();
  }) as unknown as typeof fetch;
}

const splitLookup: LookupFn = async (host) =>
  host === 'internal.corp' || host === 'evil.example' ? [{ address: host === 'evil.example' ? '127.0.0.1' : '10.0.0.5', family: 4 }] : publicLookup(host);

async function login(opts: { fetch?: typeof fetch; lookup?: LookupFn } = {}) {
  const t = makeTestApp({ fetch: opts.fetch ?? acmeFetch(), lookup: opts.lookup ?? splitLookup });
  const agent = request.agent(t.app);
  await agent.post('/api/auth/setup').send({ username: 'yakup', password: 'correct horse battery' });
  const ctx: ServiceCtx = { db: t.db, config: t.config, fetch: opts.fetch ?? acmeFetch(), now: () => t.clock.now, lookup: opts.lookup ?? splitLookup };
  return { ...t, agent, ctx };
}

const base = { amountMinor: 100, currency: 'TRY', cycle: 'monthly', intervalCount: 1, nextDue: '2026-12-31' };

describe('logo pool', () => {
  it('finds claude brand for claude.ai and netflix for Netflix', () => {
    expect(findBrands('claude.ai')[0]?.slug).toBe('claude');
    expect(findBrands('Netflix')[0]?.slug).toBe('netflix');
    expect(findBrands('zzqqxx-not-a-brand')).toEqual([]);
  });

  it('brand svg contains brand hex and is served with CSP', async () => {
    const { app } = await login();
    const res = await request(app).get('/api/logos/brand/netflix.svg?style=filled');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/svg+xml');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(String(res.text ?? res.body)).toMatch(/E50914/i);
    expect((await request(app).get('/api/logos/brand/no-such-brand.svg')).status).toBe(404);
  });

  it('discovers apple-touch-icon and sorts by size', async () => {
    const { ctx } = await login();
    const icons = await discoverSiteIcons(ctx, 'acme.com');
    expect(icons.slice(0, 3).map((i) => i.url)).toEqual(['https://acme.com/icon-512.png', 'https://acme.com/apple.png', 'https://acme.com/favicon-32.png']);
    expect(icons[0]!.size).toBe(512);
  });

  it('reads pixel width of png and ico', () => {
    const png180 = Buffer.from(PNG);
    png180.writeUInt32BE(180, 16);
    expect(imageWidth(png180, 'png')).toBe(180);
    const ico = Buffer.alloc(6 + 32);
    ico.writeUInt16LE(2, 4);
    ico[6] = 16;
    ico[22] = 48;
    expect(imageWidth(ico, 'ico')).toBe(48);
    expect(imageWidth(Buffer.from('<svg/>'), 'svg')).toBe(512);
  });

  it('asks sites like a browser and skips tiny unsized icons for a big one', async () => {
    const tiny = Buffer.from(PNG);
    tiny.writeUInt32BE(16, 16);
    const big = Buffer.from(PNG);
    big.writeUInt32BE(180, 16);
    const agents: string[] = [];
    const f = (async (u: string, init?: RequestInit) => {
      const url = String(u);
      agents.push(String((init?.headers as Record<string, string> | undefined)?.['user-agent'] ?? ''));
      if (url === 'https://shop.com/') return html('<link rel="icon" href="/fav.png"><link rel="icon" href="/big.png">');
      if (url === 'https://shop.com/fav.png') return new Response(tiny, { headers: { 'content-type': 'image/png' } });
      if (url === 'https://shop.com/big.png') return new Response(big, { headers: { 'content-type': 'image/png' } });
      return notFound();
    }) as unknown as typeof fetch;
    const { ctx } = await login({ fetch: f });
    const name = await fetchBestLogo({ ...ctx, fetch: f }, 'shop.com');
    expect(name).toMatch(/\.png$/);
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    expect(readFileSync(join(ctx.config.dataDir, 'logos', name!)).readUInt32BE(16)).toBe(180);
    expect(agents.every((a) => a.startsWith('Mozilla/5.0'))).toBe(true);
  });

  it('falls back to Google icon cache when the site blocks us', async () => {
    const big = Buffer.from(PNG);
    big.writeUInt32BE(180, 16);
    const f = (async (u: string) => {
      const url = String(u);
      if (url.startsWith('https://t1.gstatic.com/faviconV2')) return new Response(big, { headers: { 'content-type': 'image/png' } });
      if (url.startsWith('https://icons.duckduckgo.com/')) return png();
      return new Response('', { status: 403 });
    }) as unknown as typeof fetch;
    const { ctx } = await login({ fetch: f });
    const name = await fetchBestLogo({ ...ctx, fetch: f }, 'blocked.com');
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    expect(readFileSync(join(ctx.config.dataDir, 'logos', name!)).readUInt32BE(16)).toBe(180);
  });

  it('refuses icon url on a private host', async () => {
    const { ctx } = await login();
    const icons = await discoverSiteIcons(ctx, 'acme.com');
    expect(icons.some((i) => i.url.includes('internal.corp'))).toBe(false);
  });

  it('refuses private and dotless hosts', async () => {
    const seen: string[] = [];
    const { agent } = await login({ fetch: acmeFetch(seen) });
    for (const domain of ['localhost', 'intranet', '10.0.0.5', '127.0.0.1', 'evil.example']) {
      const res = await agent.get(`/api/logos/candidates?q=x&domain=${domain}`);
      expect(res.status, domain).toBe(200);
      expect(res.body.candidates.filter((c: { kind: string }) => c.kind !== 'brand'), domain).toEqual([]);
    }
    expect(seen).toEqual([]);
  });

  it('lists brand, then site icons, then duckduckgo', async () => {
    const { agent } = await login();
    const res = await agent.get('/api/logos/candidates?q=Netflix&domain=acme.com');
    const kinds = res.body.candidates.map((c: { kind: string }) => c.kind);
    expect(kinds[0]).toBe('brand');
    expect(kinds.at(-1)).toBe('ddg');
    expect(kinds.indexOf('site')).toBeGreaterThan(0);
    const site = res.body.candidates.find((c: { kind: string }) => c.kind === 'site');
    const preview = await agent.get(site.previewUrl);
    expect(preview.status).toBe(200);
    expect(preview.headers['content-type']).toBe('image/png');
  });

  it('proxy refuses an id that was not issued as a candidate', async () => {
    const { agent } = await login();
    expect((await agent.get('/api/logos/proxy/0123456789abcdef0123456789abcdef01234567')).status).toBe(404);
  });

  it('select stores brand logo and sets logoPath', async () => {
    const { agent, app } = await login();
    const id = (await agent.post('/api/subscriptions').send({ ...base, name: 'Thing' })).body.id;
    const res = await agent.post(`/api/subscriptions/${id}/logo/select`).send({ candidateId: 'brand:netflix', style: 'plain' });
    expect(res.status).toBe(200);
    expect(res.body.logoPath).toMatch(/\.svg$/);
    expect((await request(app).get(`/logos/${res.body.logoPath}`)).status).toBe(200);
  });

  it('select stores a site candidate', async () => {
    const { agent } = await login();
    const id = (await agent.post('/api/subscriptions').send({ ...base, name: 'Acme' })).body.id;
    const cands = (await agent.get('/api/logos/candidates?q=Acme&domain=acme.com')).body.candidates;
    const site = cands.find((c: { kind: string }) => c.kind === 'site');
    const res = await agent.post(`/api/subscriptions/${id}/logo/select`).send({ candidateId: site.id });
    expect(res.status).toBe(200);
    expect(res.body.logoPath).toMatch(/\.png$/);
  });

  it('select with unknown candidate → 400', async () => {
    const { agent } = await login();
    const id = (await agent.post('/api/subscriptions').send({ ...base, name: 'Thing' })).body.id;
    const res = await agent.post(`/api/subscriptions/${id}/logo/select`).send({ candidateId: 'abc' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('unknown_candidate');
  });

  it('background fetch prefers brand over ddg', async () => {
    const seen: string[] = [];
    const { agent } = await login({ fetch: acmeFetch(seen) });
    const id = (await agent.post('/api/subscriptions').send({ ...base, name: 'Netflix', domain: 'netflix.com' })).body.id;
    await waitForLogoFetches();
    expect((await agent.get(`/api/subscriptions/${id}`)).body.logoPath).toMatch(/\.svg$/);
    expect(seen).toEqual([]);
  });

  it('background fetch uses the biggest site icon before ddg', async () => {
    const seen: string[] = [];
    const { agent } = await login({ fetch: acmeFetch(seen) });
    const id = (await agent.post('/api/subscriptions').send({ ...base, name: 'Acme', domain: 'acme.com' })).body.id;
    await waitForLogoFetches();
    expect((await agent.get(`/api/subscriptions/${id}`)).body.logoPath).toMatch(/\.png$/);
    expect(seen).toContain('https://acme.com/icon-512.png');
    expect(seen.some((u) => u.includes('duckduckgo'))).toBe(false);
  });

  it('DELETE logo clears logoPath', async () => {
    const { agent } = await login();
    const id = (await agent.post('/api/subscriptions').send({ ...base, name: 'Thing' })).body.id;
    await agent.post(`/api/subscriptions/${id}/logo/select`).send({ candidateId: 'brand:netflix' });
    const res = await agent.delete(`/api/subscriptions/${id}/logo`);
    expect(res.status).toBe(200);
    expect(res.body.logoPath).toBeNull();
  });
});
