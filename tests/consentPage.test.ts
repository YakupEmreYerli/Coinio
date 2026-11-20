import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { localeFromAcceptLanguage } from '../src/server/oauth/consentI18n.js';
import { fontFaceCss } from '../src/server/oauth/consentPage.js';
import { makeTestApp } from './helpers.js';

const REDIRECT = 'https://claude.ai/api/mcp/auth_callback';

async function setup() {
  const t = makeTestApp();
  const res = await request(t.app).post('/api/auth/setup').send({ username: 'deniz', password: 'correct horse battery' });
  const cookie = res.headers['set-cookie']![0]!.split(';')[0]!;
  return { ...t, cookie };
}

async function consentPath(t: Awaited<ReturnType<typeof setup>>, scope = 'subscriptions:read subscriptions:write', clientName = 'Claude') {
  const reg = await request(t.app)
    .post('/register')
    .send({ redirect_uris: [REDIRECT], client_name: clientName, token_endpoint_auth_method: 'none' });
  const auth = await request(t.app).get('/authorize').query({
    response_type: 'code', client_id: reg.body.client_id, redirect_uri: REDIRECT, scope,
    code_challenge: 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM', code_challenge_method: 'S256', state: 'x',
  });
  return auth.headers.location as string;
}

describe('localeFromAcceptLanguage', () => {
  it.each([
    [undefined, 'en'],
    ['', 'en'],
    ['tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7', 'tr'],
    ['en-US,en;q=0.9,tr;q=0.8', 'en'],
    ['de-DE,tr;q=0.8,en;q=0.5', 'tr'],
    ['fr,de', 'en'],
    ['en;q=0.4,tr;q=0.9', 'tr'],
    ['tr;q=0,en', 'en'],
  ])('%s → %s', (header, want) => {
    expect(localeFromAcceptLanguage(header)).toBe(want);
  });
});

describe('consent page', () => {
  it('defaults to English with the username, plain-language scopes, the return host and the revoke hint', async () => {
    const t = await setup();
    const page = await request(t.app).get(await consentPath(t)).set('Cookie', t.cookie);
    expect(page.status).toBe(200);
    expect(page.text).toContain('<html lang="en">');
    expect(page.text).toContain('Claude wants access to your Coinio');
    expect(page.text).toContain('Signed in as <strong>deniz</strong>');
    expect(page.text).toContain('See your subscriptions and payments');
    expect(page.text).toContain('Add, change and delete subscriptions and record payments');
    expect(page.text).toMatch(/class="scope write"/);
    expect(page.text).toContain('You’ll return to <strong>claude.ai</strong>');
    expect(page.text).toContain('Settings › Integrations');
    expect(page.text).toContain('>Allow access<');
    expect(page.text).toContain('>Deny<');
    expect(page.headers['vary']).toMatch(/Accept-Language/);
  });

  it('only lists the scopes that were requested', async () => {
    const t = await setup();
    const page = await request(t.app).get(await consentPath(t, 'subscriptions:read')).set('Cookie', t.cookie);
    expect(page.text).toContain('See your subscriptions and payments');
    expect(page.text).not.toContain('class="scope write"');
  });

  it('speaks Turkish for a Turkish browser', async () => {
    const t = await setup();
    const page = await request(t.app).get(await consentPath(t)).set('Cookie', t.cookie).set('Accept-Language', 'tr-TR,tr;q=0.9,en;q=0.8');
    expect(page.text).toContain('<html lang="tr">');
    expect(page.headers['content-language']).toBe('tr');
    expect(page.text).toContain('Claude, Coinio hesabına erişmek istiyor');
    expect(page.text).toContain('<strong>deniz</strong> olarak giriş yaptın');
    expect(page.text).toContain('Abonelikleri ve ödemeleri görme');
    expect(page.text).toContain('Abonelik ekleme, değiştirme, silme ve ödeme kaydetme');
    expect(page.text).toContain('>İzin ver<');
    expect(page.text).toContain('>Reddet<');
    expect(page.text).toContain('Ayarlar › Entegrasyonlar');
  });

  it('prefers the saved locale setting over the browser language', async () => {
    const t = await setup();
    await request(t.app).patch('/api/settings').set('Cookie', t.cookie).send({ locale: 'tr' }).expect(200);
    const page = await request(t.app).get(await consentPath(t)).set('Cookie', t.cookie).set('Accept-Language', 'en-US');
    expect(page.text).toContain('<html lang="tr">');
  });

  it('keeps escaping the client name in Turkish too', async () => {
    const t = await setup();
    const path = await consentPath(t, 'subscriptions:read', '<img src=x onerror=alert(1)>');
    const page = await request(t.app).get(path).set('Cookie', t.cookie).set('Accept-Language', 'tr');
    expect(page.text).not.toContain('<img src=x');
    expect(page.text).toContain('&lt;img src=x onerror=alert(1)&gt;, Coinio hesabına erişmek istiyor');
    expect(page.text).toContain('<span class="tile">&lt;</span>');
  });
});

describe('login and error pages', () => {
  it('localizes the login form and keeps proper autocomplete hints', async () => {
    const t = await setup();
    const en = await request(t.app).get('/oauth/login?next=%2Foauth%2Fconsent%3Freq%3Dabc');
    expect(en.text).toContain('<html lang="en">');
    expect(en.text).toContain('Sign in to Coinio');
    expect(en.text).toContain('data-next="/oauth/consent?req=abc"');
    expect(en.text).toContain('autocomplete="username"');
    expect(en.text).toContain('autocomplete="current-password"');
    expect(en.text).toContain('data-limited="Too many attempts. Try again in a few minutes."');
    const tr = await request(t.app).get('/oauth/login').set('Accept-Language', 'tr');
    expect(tr.text).toContain('<html lang="tr">');
    expect(tr.text).toContain('Coinio’ya giriş yap');
    expect(tr.text).toContain('Parolayı göster');
    expect(tr.text).toContain('data-next="/"');
  });

  it('localizes the expired, signed-out and invalid pages', async () => {
    const t = await setup();
    const expired = await request(t.app).get('/oauth/consent?req=nope').set('Cookie', t.cookie).set('Accept-Language', 'tr');
    expect(expired.status).toBe(400);
    expect(expired.text).toContain('Bu isteğin süresi doldu');

    const signedOut = await request(t.app).post('/oauth/consent').set('Accept-Language', 'tr').type('form').send({ req: 'x' });
    expect(signedOut.status).toBe(401);
    expect(signedOut.text).toContain('<html lang="tr">');
    expect(signedOut.text).toContain('Oturumun kapalı');

    const path = await consentPath(t);
    const reqId = new URL(path, 'http://x').searchParams.get('req')!;
    const invalid = await request(t.app).post('/oauth/consent').set('Cookie', t.cookie).type('form')
      .send({ req: reqId, csrf: 'wrong', decision: 'allow' });
    expect(invalid.status).toBe(403);
    expect(invalid.text).toContain('<html lang="en">');
    expect(invalid.text).toContain('Invalid request');
    expect(invalid.headers['x-frame-options']).toBe('DENY');
  });
});

describe('fontFaceCss', () => {
  it('points at the web build’s font files and is empty without a build', () => {
    const dir = mkdtempSync(join(tmpdir(), 'coinio-fonts-'));
    expect(fontFaceCss(dir)).toBe('');
    mkdirSync(join(dir, 'assets'));
    for (const f of ['geist-latin-wght-normal-AbC_1.woff2', 'geist-latin-ext-wght-normal-x9.woff2',
      'geist-mono-latin-wght-normal-Zz.woff2', 'plus-jakarta-sans-latin-wght-normal-Q-1.woff2', 'geist-cyrillic-wght-normal-n.woff2']) {
      writeFileSync(join(dir, 'assets', f), '');
    }
    const css = fontFaceCss(dir);
    expect(css).toContain("font-family:'Geist';");
    expect(css).toContain('url(/assets/geist-latin-wght-normal-AbC_1.woff2)');
    expect(css).toContain('url(/assets/geist-latin-ext-wght-normal-x9.woff2)');
    expect(css).toContain("font-family:'Geist Mono';");
    expect(css).toContain("font-family:'Plus Jakarta Sans';");
    expect(css).not.toContain('cyrillic');
    expect(css.match(/@font-face/g)).toHaveLength(4);
  });
});
