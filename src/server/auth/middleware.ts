// Type-only import: pulls in the SDK's augmentation of Express Request (`req.auth`).
import type {} from '@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { Request, RequestHandler } from 'express';
import type { Db } from '../db/client.js';
import type { ServiceCtx } from '../services/context.js';
import { verifyApiKey } from '../services/apiKeys.js';
import { verifyOAuthAccessToken } from '../oauth/provider.js';
import { SESSION_COOKIE, findSessionUserId } from './sessions.js';

export function requireSession(db: Db, now: () => Date): RequestHandler {
  return (req, res, next) => {
    const sid = req.cookies?.[SESSION_COOKIE];
    const userId = typeof sid === 'string' ? findSessionUserId(db, sid, now()) : null;
    if (userId === null) {
      res.status(401).json({ error: 'unauthorized' });
      return;
    }
    req.userId = userId;
    next();
  };
}

export type Scope = 'read' | 'full';
export type Principal = { userId: number; scope: Scope; via: 'apikey' | 'oauth' };

/** Resolves a raw bearer token to AuthInfo (with `extra` = Principal), or null if it is not one of its tokens. */
export type BearerVerifier = (ctx: ServiceCtx, raw: string) => AuthInfo | null | Promise<AuthInfo | null>;

export const apiKeyVerifier: BearerVerifier = (ctx, raw) => {
  const k = verifyApiKey(ctx, raw);
  if (!k) return null;
  return {
    token: raw,
    clientId: `apikey:${k.keyId}`,
    scopes: [k.scope],
    extra: { userId: k.userId, scope: k.scope, via: 'apikey' } satisfies Principal,
  };
};

export const oauthVerifier: BearerVerifier = verifyOAuthAccessToken;

const isPrincipal = (e: unknown): e is Principal => {
  const p = e as Partial<Principal> | undefined;
  return typeof p?.userId === 'number' && (p.scope === 'read' || p.scope === 'full') && (p.via === 'apikey' || p.via === 'oauth');
};

export function principal(req: Request): Principal {
  const e = req.auth?.extra as Principal | undefined;
  if (!e) throw new Error('principal() called on a request without requireBearer');
  return { userId: e.userId, scope: e.scope, via: e.via };
}

/**
 * Bearer auth. `scopes` lists acceptable scopes; a `full` token always passes.
 * Verifiers are tried in order, first match wins. With `resourceMetadataUrl`, 401s carry
 * `WWW-Authenticate: Bearer resource_metadata="…"` so OAuth clients can discover the authorization server.
 */
export function requireBearer(
  ctx: ServiceCtx,
  scopes: Scope[],
  verifiers: BearerVerifier[] = [apiKeyVerifier],
  opts: { resourceMetadataUrl?: string } = {},
): RequestHandler {
  return async (req, res, next) => {
    const m = /^Bearer +(\S+)$/i.exec(req.headers.authorization ?? '');
    let auth: AuthInfo | null = null;
    if (m) for (const v of verifiers) if ((auth = await v(ctx, m[1]!))) break;
    if (!auth || !isPrincipal(auth.extra)) {
      const error = m ? 'invalid_token' : 'unauthorized';
      if (opts.resourceMetadataUrl) {
        const errorParam = m ? 'error="invalid_token", ' : '';
        res.set('WWW-Authenticate', `Bearer ${errorParam}resource_metadata="${opts.resourceMetadataUrl}"`);
      }
      res.status(401).json({ error });
      return;
    }
    const scope = (auth.extra as Principal).scope;
    if (scope !== 'full' && !scopes.includes(scope)) {
      res.status(403).json({ error: 'insufficient_scope' });
      return;
    }
    req.auth = auth;
    next();
  };
}
