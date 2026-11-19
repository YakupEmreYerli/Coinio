import express, { Router, type Request, type Response } from 'express';
import { APP_NAME } from '../../shared/brand.js';
import { SESSION_COOKIE, findSessionUserId } from '../auth/sessions.js';
import type { ServiceCtx } from '../services/context.js';
import type { SqliteOAuthProvider } from './provider.js';

const SCOPE_TEXT: Record<string, string> = {
  'subscriptions:read': 'Read your subscriptions and payments',
  'subscriptions:write': 'Add, change and delete subscriptions and record payments',
};

// Only our own consent URL is a valid login target, so the form cannot become an open redirect.
const CONSENT_NEXT = /^\/oauth\/consent\?req=[A-Za-z0-9_-]+$/;

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function sendPage(res: Response, status: number, title: string, body: string): void {
  res
    .status(status)
    .set({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer',
    })
    .send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} · ${APP_NAME}</title>
<style>body{font-family:system-ui,sans-serif;max-width:26rem;margin:3rem auto;padding:0 1rem;line-height:1.5}
input,button{font:inherit;padding:.5rem;margin:.25rem 0;width:100%;box-sizing:border-box}.row{display:flex;gap:.5rem}
.err{color:#b00020}</style></head><body>${body}</body></html>`);
}

export function consentRouter(ctx: ServiceCtx, provider: SqliteOAuthProvider): Router {
  const router = Router();
  const sessionUserId = (req: Request) => {
    const sid = req.cookies?.[SESSION_COOKIE];
    return typeof sid === 'string' ? findSessionUserId(ctx.db, sid, ctx.now()) : null;
  };
  const expired = (res: Response) =>
    sendPage(res, 400, 'Request expired', '<h1>Request expired</h1><p>Start connecting again from the app.</p>');

  // Minimal login for the OAuth flow; it posts to the regular rate-limited login API.
  router.get('/oauth/login', (req, res) => {
    const next = typeof req.query.next === 'string' && CONSENT_NEXT.test(req.query.next) ? req.query.next : '/';
    sendPage(res, 200, 'Sign in', `<h1>Sign in to ${APP_NAME}</h1>
<form id="login" data-next="${escapeHtml(next)}">
<label>Username <input name="username" autocomplete="username" required></label>
<label>Password <input name="password" type="password" autocomplete="current-password" required></label>
<button type="submit">Sign in</button><p class="err" id="err"></p></form>
<script>
const f = document.getElementById('login');
f.addEventListener('submit', async (e) => {
  e.preventDefault();
  const r = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: f.username.value, password: f.password.value }) });
  if (r.ok) location.href = f.dataset.next;
  else document.getElementById('err').textContent = r.status === 429 ? 'Too many attempts, try later.' : 'Wrong username or password.';
});
</script>`);
  });

  router.get('/oauth/consent', (req, res) => {
    const id = typeof req.query.req === 'string' ? req.query.req : '';
    if (sessionUserId(req) === null) {
      res.redirect(302, `/oauth/login?next=${encodeURIComponent(`/oauth/consent?req=${id}`)}`);
      return;
    }
    const p = provider.pendingAuthorization(id);
    if (!p) return expired(res);
    const name = escapeHtml(p.clientName);
    const verb = p.scopes.includes('subscriptions:write') ? 'read and change' : 'read';
    const scopes = p.scopes.map((s) => `<li>${escapeHtml(SCOPE_TEXT[s] ?? s)} (<code>${escapeHtml(s)}</code>)</li>`).join('');
    sendPage(res, 200, 'Allow access', `<h1>Allow access?</h1>
<p><strong>${name}</strong> wants to ${verb} your subscriptions.</p>
<ul>${scopes}</ul>
<p>After you decide, you will be sent to <code>${escapeHtml(new URL(p.redirectUri).host)}</code>.</p>
<form method="post" action="/oauth/consent">
<input type="hidden" name="req" value="${escapeHtml(id)}"><input type="hidden" name="csrf" value="${escapeHtml(p.csrf)}">
<div class="row"><button name="decision" value="deny">Deny</button><button name="decision" value="allow">Allow</button></div>
</form>`);
  });

  router.post('/oauth/consent', express.urlencoded({ extended: false }), (req, res) => {
    const userId = sessionUserId(req);
    if (userId === null) {
      sendPage(res, 401, 'Signed out', '<h1>You are signed out</h1><p>Start connecting again from the app.</p>');
      return;
    }
    const { req: id, csrf, decision } = req.body as Record<string, unknown>;
    if (typeof id !== 'string' || !provider.pendingAuthorization(id)) return expired(res);
    const redirect = provider.completeAuthorization(id, typeof csrf === 'string' ? csrf : '', userId, decision === 'allow');
    if (!redirect) {
      sendPage(res, 403, 'Invalid request', '<h1>Invalid request</h1><p>Reload the page and try again.</p>');
      return;
    }
    res.redirect(302, redirect);
  });

  return router;
}
