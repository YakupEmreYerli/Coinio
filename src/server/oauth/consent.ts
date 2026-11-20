import express, { Router, type Request, type Response } from 'express';
import { eq } from 'drizzle-orm';
import { SESSION_COOKIE, findSessionUserId } from '../auth/sessions.js';
import { settings, users } from '../db/schema.js';
import type { ServiceCtx } from '../services/context.js';
import { isLocale } from '../../shared/locales.js';
import { consentStrings, localeFromAcceptLanguage, type ConsentLocale } from './consentI18n.js';
import { escapeHtml, fontFaceCss, markSvg, renderPage } from './consentPage.js';
import type { SqliteOAuthProvider } from './provider.js';

// Only our own consent URL is a valid login target, so the form cannot become an open redirect.
const CONSENT_NEXT = /^\/oauth\/consent\?req=[A-Za-z0-9_-]+$/;

const svg = (size: number, inner: string) =>
  `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
const ICON = {
  check: svg(14, '<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  pencil: svg(13, '<path d="M14.5 5.5l4 4M4 20l1-4.5L15.5 5a1.4 1.4 0 0 1 2 0l1.5 1.5a1.4 1.4 0 0 1 0 2L8.5 19z"/>'),
  arrow: svg(15, '<path d="M14 5h5v5M19 5l-8 8M18 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4"/>'),
  alert: svg(15, '<circle cx="12" cy="12" r="9"/><path d="M12 8v4.5M12 16h.01"/>'),
  eye: svg(18, '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>'),
  eyeOff: svg(18, '<path d="M4 4l16 16M10.6 6a8.9 8.9 0 0 1 1.4-.1c6 0 9.5 6.1 9.5 6.1a16 16 0 0 1-2.6 3.3M6.6 7.4C4 9.1 2.5 12 2.5 12s3.5 6.5 9.5 6.5a9 9 0 0 0 4-1M9.9 10a2.8 2.8 0 0 0 4 4"/>'),
  clock: svg(20, '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>'),
  lock: svg(20, '<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>'),
};

const SECURITY_HEADERS = {
  'Content-Type': 'text/html; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "frame-ancestors 'none'",
  'Referrer-Policy': 'no-referrer',
  Vary: 'Accept-Language, Cookie',
};

export function consentRouter(ctx: ServiceCtx, provider: SqliteOAuthProvider): Router {
  const router = Router();
  const fonts = fontFaceCss(ctx.config.webDir);
  const sessionUserId = (req: Request) => {
    const sid = req.cookies?.[SESSION_COOKIE];
    return typeof sid === 'string' ? findSessionUserId(ctx.db, sid, ctx.now()) : null;
  };
  // A signed-in user's saved language wins; otherwise the browser's.
  const localeOf = (req: Request, userId = sessionUserId(req)): ConsentLocale => {
    if (userId !== null) {
      const saved = ctx.db.select().from(settings).where(eq(settings.key, 'locale')).get()?.value;
      if (isLocale(saved)) return saved;
    }
    return localeFromAcceptLanguage(req.get('accept-language'));
  };
  const sendPage = (res: Response, status: number, lang: ConsentLocale, title: string, body: string) => {
    res.status(status).set({ ...SECURITY_HEADERS, 'Content-Language': lang }).send(renderPage({ lang, title, body, fonts }));
  };
  const statusPage = (res: Response, status: number, lang: ConsentLocale, kind: 'expired' | 'signedOut' | 'invalid') => {
    const t = consentStrings(lang);
    const pages: Record<typeof kind, [string, string, string]> = {
      expired: [t('expiredTitle'), t('expiredBody'), ICON.clock],
      signedOut: [t('signedOutTitle'), t('signedOutBody'), ICON.lock],
      invalid: [t('invalidTitle'), t('invalidBody'), ICON.alert.replace('width="15" height="15"', 'width="20" height="20"')],
    };
    const [title, body, icon] = pages[kind];
    sendPage(res, status, lang, title, `<section class="card status">
<div class="status-icon${kind === 'invalid' ? ' warn' : ''}">${icon}</div>
<h1>${escapeHtml(title)}</h1><p class="lead">${escapeHtml(body)}</p>
<a class="btn btn-secondary" href="/">${escapeHtml(t('openApp'))}</a></section>`);
  };

  // Minimal login for the OAuth flow; it posts to the regular rate-limited login API.
  router.get('/oauth/login', (req, res) => {
    const lang = localeOf(req);
    const t = consentStrings(lang);
    const next = typeof req.query.next === 'string' && CONSENT_NEXT.test(req.query.next) ? req.query.next : '/';
    const attr = (s: string) => escapeHtml(s);
    sendPage(res, 200, lang, t('signIn'), `<section class="card">
<h1>${escapeHtml(t('signInTitle'))}</h1>
<p class="lead">${escapeHtml(next === '/' ? t('signInLead') : t('signInLeadConnect'))}</p>
<form id="login" novalidate data-next="${attr(next)}" data-wrong="${attr(t('wrongCredentials'))}" data-limited="${attr(t('tooManyAttempts'))}"
 data-offline="${attr(t('networkError'))}" data-busy="${attr(t('signingIn'))}" data-show="${attr(t('showPassword'))}" data-hide="${attr(t('hidePassword'))}">
<label class="field"><span class="field-label">${escapeHtml(t('username'))}</span>
<input class="input" id="username" name="username" autocomplete="username" autocapitalize="none" autocorrect="off" spellcheck="false" required autofocus></label>
<label class="field" for="password"><span class="field-label">${escapeHtml(t('password'))}</span></label>
<div class="input-wrap has-toggle"><input class="input" id="password" name="password" type="password" autocomplete="current-password" required>
<button class="toggle" type="button" id="toggle" aria-controls="password" aria-pressed="false" aria-label="${attr(t('showPassword'))}" title="${attr(t('showPassword'))}">
<span class="eye">${ICON.eye}</span><span class="eye-off">${ICON.eyeOff}</span></button></div>
<div class="alert" id="err" role="alert" hidden>${ICON.alert}<span id="err-text"></span></div>
<button class="btn btn-primary submit" type="submit" id="submit"><span class="spinner" aria-hidden="true"></span><span id="submit-label">${escapeHtml(t('signIn'))}</span></button>
</form></section>
<script>
const f = document.getElementById('login'), d = f.dataset, pw = f.password, tg = document.getElementById('toggle');
const btn = document.getElementById('submit'), lbl = document.getElementById('submit-label'), idle = lbl.textContent;
const err = document.getElementById('err'), errText = document.getElementById('err-text');
tg.addEventListener('click', () => {
  const show = pw.type === 'password';
  pw.type = show ? 'text' : 'password';
  tg.setAttribute('aria-pressed', String(show));
  tg.setAttribute('aria-label', show ? d.hide : d.show);
  tg.title = show ? d.hide : d.show;
});
const fail = (msg) => {
  errText.textContent = msg; err.hidden = false;
  f.username.setAttribute('aria-invalid', 'true'); pw.setAttribute('aria-invalid', 'true');
  btn.disabled = false; btn.removeAttribute('aria-busy'); lbl.textContent = idle;
};
f.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!f.username.value || !pw.value) { (f.username.value ? pw : f.username).focus(); return; }
  btn.disabled = true; btn.setAttribute('aria-busy', 'true'); lbl.textContent = d.busy; err.hidden = true;
  try {
    const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: f.username.value, password: pw.value }) });
    if (r.ok) { location.href = d.next; return; }
    fail(r.status === 429 ? d.limited : d.wrong);
    if (r.status !== 429) { pw.select(); pw.focus(); }
  } catch { fail(d.offline); }
});
</script>`);
  });

  router.get('/oauth/consent', (req, res) => {
    const id = typeof req.query.req === 'string' ? req.query.req : '';
    const userId = sessionUserId(req);
    if (userId === null) {
      res.redirect(302, `/oauth/login?next=${encodeURIComponent(`/oauth/consent?req=${id}`)}`);
      return;
    }
    const lang = localeOf(req, userId);
    const t = consentStrings(lang);
    const p = provider.pendingAuthorization(id);
    if (!p) return statusPage(res, 400, lang, 'expired');
    const name = escapeHtml(p.clientName);
    const username = ctx.db.select({ username: users.username }).from(users).where(eq(users.id, userId)).get()?.username ?? '';
    const scopes = p.scopes
      .map((s) => {
        const write = s === 'subscriptions:write';
        const known = write || s === 'subscriptions:read';
        const title = known ? (write ? t('scopeWrite') : t('scopeRead')) : s;
        return `<li class="scope${write ? ' write' : ''}"><span class="glyph">${write ? ICON.pencil : ICON.check}</span>
<div class="scope-text"><div class="scope-title">${escapeHtml(title)}</div>
<div class="scope-sub">${known ? `<span class="tag">${escapeHtml(write ? t('scopeWriteTag') : t('scopeReadTag'))}</span>` : ''}<code>${escapeHtml(s)}</code></div></div></li>`;
      })
      .join('');
    const initial = escapeHtml(Array.from(p.clientName.trim())[0]?.toUpperCase() ?? '?');
    sendPage(res, 200, lang, t('consentTitle'), `<section class="card">
<div class="connect" aria-hidden="true"><span class="tile">${initial}</span><span class="link"><i></i><i></i><i></i></span><span class="tile coinio">${markSvg(26)}</span></div>
<h1>${t('wantsAccess', { client: name })}</h1>
${username ? `<p class="meta"><span class="dot"></span><span>${t('signedInAs', { user: escapeHtml(username) })}</span></p>` : ''}
<h2 class="section">${escapeHtml(t('willBeAbleTo'))}</h2>
<ul class="scopes">${scopes}</ul>
<p class="return">${ICON.arrow}<span>${t('returnTo', { host: escapeHtml(new URL(p.redirectUri).host) })}</span></p>
<form method="post" action="/oauth/consent">
<input type="hidden" name="req" value="${escapeHtml(id)}"><input type="hidden" name="csrf" value="${escapeHtml(p.csrf)}">
<div class="actions"><button class="btn btn-secondary" name="decision" value="deny">${escapeHtml(t('deny'))}</button><button class="btn btn-primary" name="decision" value="allow">${escapeHtml(t('allow'))}</button></div>
</form>
<p class="foot">${escapeHtml(t('revokeHint'))}</p></section>`);
  });

  router.post('/oauth/consent', express.urlencoded({ extended: false }), (req, res) => {
    const userId = sessionUserId(req);
    if (userId === null) return statusPage(res, 401, localeOf(req, null), 'signedOut');
    const lang = localeOf(req, userId);
    const { req: id, csrf, decision } = req.body as Record<string, unknown>;
    if (typeof id !== 'string' || !provider.pendingAuthorization(id)) return statusPage(res, 400, lang, 'expired');
    const redirect = provider.completeAuthorization(id, typeof csrf === 'string' ? csrf : '', userId, decision === 'allow');
    if (!redirect) return statusPage(res, 403, lang, 'invalid');
    res.redirect(302, redirect);
  });

  return router;
}
