import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { OAuthRegisteredClientsStore } from '@modelcontextprotocol/sdk/server/auth/clients.js';
import { InvalidGrantError, InvalidScopeError, InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import type { AuthorizationParams, OAuthServerProvider } from '@modelcontextprotocol/sdk/server/auth/provider.js';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type { OAuthClientInformationFull, OAuthTokenRevocationRequest, OAuthTokens } from '@modelcontextprotocol/sdk/shared/auth.js';
import { and, eq, gt, isNull, lte, sql } from 'drizzle-orm';
import type { Response } from 'express';
import type { Principal } from '../auth/middleware.js';
import { oauthClients, oauthCodes, oauthTokens } from '../db/schema.js';
import type { ServiceCtx } from '../services/context.js';
import { NotFoundError } from '../services/subscriptions.js';

export const OAUTH_SCOPES = ['subscriptions:read', 'subscriptions:write'] as const;
const WRITE_SCOPE = 'subscriptions:write';

const CODE_TTL_MS = 10 * 60 * 1000;
const PENDING_TTL_MS = 10 * 60 * 1000;
const ACCESS_TTL_MS = 60 * 60 * 1000;
const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const newSecret = () => randomBytes(32).toString('base64url');
const iso = (ms: number) => new Date(ms).toISOString();

export type PendingAuthorization = {
  clientId: string;
  clientName: string;
  scopes: string[];
  codeChallenge: string;
  redirectUri: string;
  state?: string;
  csrf: string;
  expiresAt: number;
};

/** Requested scopes → granted scopes. No scope requested means both; unknown scopes are rejected. */
function grantedScopes(requested: string[] | undefined): string[] {
  const asked = [...new Set((requested ?? []).filter((s) => s.length > 0))];
  if (asked.length === 0) return [...OAUTH_SCOPES];
  const unknown = asked.filter((s) => !(OAUTH_SCOPES as readonly string[]).includes(s));
  if (unknown.length > 0) throw new InvalidScopeError(`unsupported scope: ${unknown.join(' ')}`);
  return asked;
}

class SqliteClientsStore implements OAuthRegisteredClientsStore {
  constructor(private readonly ctx: ServiceCtx) {}

  getClient(clientId: string): OAuthClientInformationFull | undefined {
    const row = this.ctx.db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId)).get();
    if (!row) return undefined;
    return { ...JSON.parse(row.metadataJson), client_id: row.clientId, client_secret: row.clientSecret ?? undefined };
  }

  registerClient(client: Omit<OAuthClientInformationFull, 'client_id' | 'client_id_issued_at'>): OAuthClientInformationFull {
    // The SDK generates client_id before calling us (clientIdGeneration defaults to true).
    const full = client as OAuthClientInformationFull;
    const { client_secret, ...metadata } = full;
    this.ctx.db.insert(oauthClients).values({
      clientId: full.client_id,
      clientSecret: client_secret ?? null,
      metadataJson: JSON.stringify(metadata),
      createdAt: this.ctx.now().toISOString(),
    }).run();
    return full;
  }
}

/**
 * Verifies an OAuth access token. Returns AuthInfo with `extra` = Principal, or null.
 * `subscriptions:write` maps to scope `full`, otherwise `read`. Updates the client's last_used_at.
 */
export function verifyOAuthAccessToken(ctx: ServiceCtx, raw: string): AuthInfo | null {
  const now = ctx.now();
  const row = ctx.db.select().from(oauthTokens)
    .where(and(eq(oauthTokens.tokenHash, sha256(raw)), eq(oauthTokens.kind, 'access'))).get();
  if (!row || row.revokedAt || row.expiresAt <= now.toISOString()) return null;
  ctx.db.update(oauthClients).set({ lastUsedAt: now.toISOString() }).where(eq(oauthClients.clientId, row.clientId)).run();
  const scopes = row.scopes.split(' ');
  return {
    token: raw,
    clientId: row.clientId,
    scopes,
    expiresAt: Math.floor(Date.parse(row.expiresAt) / 1000),
    extra: { userId: row.userId, scope: scopes.includes(WRITE_SCOPE) ? 'full' : 'read', via: 'oauth' } satisfies Principal,
  };
}

export class SqliteOAuthProvider implements OAuthServerProvider {
  readonly clientsStore: SqliteClientsStore;
  /** Authorization requests waiting for the user's consent, keyed by a random id. In memory: a restart just restarts the flow. */
  private readonly pending = new Map<string, PendingAuthorization>();

  constructor(private readonly ctx: ServiceCtx) {
    this.clientsStore = new SqliteClientsStore(ctx);
  }

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    const scopes = grantedScopes(params.scopes);
    const nowMs = this.ctx.now().getTime();
    for (const [id, p] of this.pending) if (p.expiresAt <= nowMs) this.pending.delete(id);
    const id = newSecret();
    this.pending.set(id, {
      clientId: client.client_id,
      clientName: client.client_name ?? client.client_id,
      scopes,
      codeChallenge: params.codeChallenge,
      redirectUri: params.redirectUri,
      state: params.state,
      csrf: newSecret(),
      expiresAt: nowMs + PENDING_TTL_MS,
    });
    res.redirect(302, `/oauth/consent?req=${encodeURIComponent(id)}`);
  }

  pendingAuthorization(id: string): PendingAuthorization | null {
    const p = this.pending.get(id);
    return p && p.expiresAt > this.ctx.now().getTime() ? p : null;
  }

  /**
   * Finishes a pending authorization after the consent form. Returns the redirect URL for the client,
   * or null when the request is unknown/expired or the CSRF token does not match (the request then stays pending).
   */
  completeAuthorization(id: string, csrf: string, userId: number, allow: boolean): string | null {
    const p = this.pendingAuthorization(id);
    if (!p) return null;
    const a = Buffer.from(csrf);
    const b = Buffer.from(p.csrf);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    this.pending.delete(id);

    const url = new URL(p.redirectUri);
    if (allow) {
      const code = newSecret();
      const now = this.ctx.now();
      this.ctx.db.delete(oauthCodes).where(lte(oauthCodes.expiresAt, now.toISOString())).run();
      this.ctx.db.insert(oauthCodes).values({
        codeHash: sha256(code),
        clientId: p.clientId,
        userId,
        codeChallenge: p.codeChallenge,
        redirectUri: p.redirectUri,
        scopes: p.scopes.join(' '),
        expiresAt: iso(now.getTime() + CODE_TTL_MS),
      }).run();
      url.searchParams.set('code', code);
    } else {
      url.searchParams.set('error', 'access_denied');
      url.searchParams.set('error_description', 'The user denied the request');
    }
    if (p.state !== undefined) url.searchParams.set('state', p.state);
    return url.href;
  }

  private findCode(client: OAuthClientInformationFull, code: string) {
    const row = this.ctx.db.select().from(oauthCodes).where(and(
      eq(oauthCodes.codeHash, sha256(code)),
      eq(oauthCodes.clientId, client.client_id),
      gt(oauthCodes.expiresAt, this.ctx.now().toISOString()),
    )).get();
    if (!row) throw new InvalidGrantError('invalid or expired authorization code');
    return row;
  }

  async challengeForAuthorizationCode(client: OAuthClientInformationFull, code: string): Promise<string> {
    return this.findCode(client, code).codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    code: string,
    _codeVerifier?: string,
    redirectUri?: string,
  ): Promise<OAuthTokens> {
    const row = this.findCode(client, code);
    // Single use: consume before issuing, so a replay finds nothing.
    if (this.ctx.db.delete(oauthCodes).where(eq(oauthCodes.codeHash, row.codeHash)).run().changes === 0) {
      throw new InvalidGrantError('invalid or expired authorization code');
    }
    if (redirectUri !== undefined && redirectUri !== row.redirectUri) {
      throw new InvalidGrantError('redirect_uri does not match the authorization request');
    }
    return this.issueTokens(client.client_id, row.userId, row.scopes.split(' '));
  }

  async exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string, scopes?: string[]): Promise<OAuthTokens> {
    const now = this.ctx.now().toISOString();
    const row = this.ctx.db.select().from(oauthTokens)
      .where(and(eq(oauthTokens.tokenHash, sha256(refreshToken)), eq(oauthTokens.kind, 'refresh'))).get();
    if (!row || row.clientId !== client.client_id || row.revokedAt || row.expiresAt <= now) {
      throw new InvalidGrantError('invalid or expired refresh token');
    }
    const granted = row.scopes.split(' ');
    if (scopes?.some((s) => !granted.includes(s))) throw new InvalidScopeError('scope exceeds the original grant');
    // Rotation: the old refresh token is revoked; only one exchange can win.
    const revoked = this.ctx.db.update(oauthTokens).set({ revokedAt: now })
      .where(and(eq(oauthTokens.tokenHash, row.tokenHash), isNull(oauthTokens.revokedAt))).run();
    if (revoked.changes === 0) throw new InvalidGrantError('invalid or expired refresh token');
    return this.issueTokens(client.client_id, row.userId, scopes ?? granted);
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const info = verifyOAuthAccessToken(this.ctx, token);
    if (!info) throw new InvalidTokenError('invalid or expired access token');
    return info;
  }

  async revokeToken(client: OAuthClientInformationFull, request: OAuthTokenRevocationRequest): Promise<void> {
    this.ctx.db.update(oauthTokens).set({ revokedAt: this.ctx.now().toISOString() }).where(and(
      eq(oauthTokens.tokenHash, sha256(request.token)),
      eq(oauthTokens.clientId, client.client_id),
      isNull(oauthTokens.revokedAt),
    )).run();
  }

  private issueTokens(clientId: string, userId: number, scopes: string[]): OAuthTokens {
    const nowMs = this.ctx.now().getTime();
    const access = newSecret();
    const refresh = newSecret();
    const scope = scopes.join(' ');
    this.ctx.db.insert(oauthTokens).values([
      { tokenHash: sha256(access), kind: 'access', clientId, userId, scopes: scope, expiresAt: iso(nowMs + ACCESS_TTL_MS) },
      { tokenHash: sha256(refresh), kind: 'refresh', clientId, userId, scopes: scope, expiresAt: iso(nowMs + REFRESH_TTL_MS) },
    ]).run();
    return { access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL_MS / 1000, refresh_token: refresh, scope };
  }
}

/** Clients that have been issued tokens for this user, with their count of usable tokens. */
export function listConnectedClients(ctx: ServiceCtx, userId: number) {
  const now = ctx.now().toISOString();
  return ctx.db
    .select({
      clientId: oauthClients.clientId,
      metadataJson: oauthClients.metadataJson,
      createdAt: oauthClients.createdAt,
      lastUsedAt: oauthClients.lastUsedAt,
      activeTokenCount: sql<number>`count(case when ${oauthTokens.revokedAt} is null and ${oauthTokens.expiresAt} > ${now} then 1 end)`,
    })
    .from(oauthClients)
    .innerJoin(oauthTokens, eq(oauthTokens.clientId, oauthClients.clientId))
    .where(eq(oauthTokens.userId, userId))
    .groupBy(oauthClients.clientId)
    .orderBy(oauthClients.createdAt)
    .all()
    .map(({ metadataJson, ...r }) => ({
      ...r,
      clientName: (JSON.parse(metadataJson) as { client_name?: string }).client_name ?? r.clientId,
    }));
}

/** Revokes every token of the client and deletes it; the app has to register and be approved again. */
export function disconnectClient(ctx: ServiceCtx, clientId: string): void {
  const exists = ctx.db.select({ id: oauthClients.clientId }).from(oauthClients).where(eq(oauthClients.clientId, clientId)).get();
  if (!exists) throw new NotFoundError('oauth client');
  ctx.db.transaction((tx) => {
    tx.update(oauthTokens).set({ revokedAt: ctx.now().toISOString() })
      .where(and(eq(oauthTokens.clientId, clientId), isNull(oauthTokens.revokedAt))).run();
    tx.delete(oauthCodes).where(eq(oauthCodes.clientId, clientId)).run();
    tx.delete(oauthClients).where(eq(oauthClients.clientId, clientId)).run();
  });
}
