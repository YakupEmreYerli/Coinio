import type { RequestHandler } from 'express';
import { userAllowed } from '../plugins.js';
import type { ServiceCtx } from '../services/context.js';
import { apiKeyVerifier, oauthVerifier, type Principal } from './middleware.js';
import { SESSION_COOKIE, findSessionUserId } from './sessions.js';

const GUARDED = /^\/(api|oauth|mcp)(\/|$)/;
// Still reachable, so the app can show the account state and sign out.
const OPEN = new Set(['/api/health', '/api/auth/state', '/api/auth/logout']);

/**
 * Answers 401 account_unavailable to a valid session, API key or OAuth token whose user a plugin does not
 * allow. Requests without valid credentials pass through; the routes reject those themselves.
 */
export function accountGuard(ctx: ServiceCtx): RequestHandler {
  return async (req, res, next) => {
    if (!GUARDED.test(req.path) || OPEN.has(req.path)) return next();
    const ids: number[] = [];
    const sid = req.cookies?.[SESSION_COOKIE];
    if (typeof sid === 'string') {
      const id = findSessionUserId(ctx.db, sid, ctx.now());
      if (id !== null) ids.push(id);
    }
    const bearer = /^Bearer +(\S+)$/i.exec(req.headers.authorization ?? '')?.[1];
    if (bearer) {
      try {
        const auth = (await apiKeyVerifier(ctx, bearer)) ?? (await oauthVerifier(ctx, bearer));
        const p = auth?.extra as Principal | undefined;
        if (typeof p?.userId === 'number') ids.push(p.userId);
      } catch {
        // not a token we know; the route answers
      }
    }
    if (ids.some((id) => !userAllowed(ctx, id))) {
      res.status(401).json({ error: 'account_unavailable' });
      return;
    }
    next();
  };
}
