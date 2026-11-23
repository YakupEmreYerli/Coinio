import { randomBytes } from 'node:crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { count, desc, eq } from 'drizzle-orm';
import type { Config } from '../config.js';
import type { Db } from '../db/client.js';
import { passkeys } from '../db/schema.js';

export const MAX_PASSKEYS_PER_USER = 10;
const CHALLENGE_TTL_MS = 5 * 60_000;
const MAX_CHALLENGES = 10_000;

export type WebAuthnOrigin = {
  rpID: string;
  expectedOrigin: string;
  rpName: string;
};

export type PasskeyMeta = {
  id: string;
  name: string;
  deviceType: 'singleDevice' | 'multiDevice';
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

export type ChallengeEntry = {
  challenge: string;
  kind: 'register' | 'login';
  userId?: number;
  rpID: string;
  expectedOrigin: string;
  expiresAt: number;
};

export type PasskeyOps = {
  generateRegistrationOptions: typeof generateRegistrationOptions;
  verifyRegistrationResponse: typeof verifyRegistrationResponse;
  generateAuthenticationOptions: typeof generateAuthenticationOptions;
  verifyAuthenticationResponse: typeof verifyAuthenticationResponse;
};

export const defaultPasskeyOps: PasskeyOps = {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
};

function isAllowedWebAuthnUrl(url: URL): boolean {
  if (url.protocol === 'https:') return true;
  if (url.protocol === 'http:') return url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  return false;
}

/**
 * Resolves WebAuthn RP ID and expected origin.
 * WebAuthn only runs in secure contexts (HTTPS, localhost, or 127.0.0.1) — plain LAN IPs return null.
 */
export function resolveWebAuthnOrigin(
  config: Config,
  req: { headers: Record<string, string | string[] | undefined>; secure?: boolean },
): WebAuthnOrigin | null {
  if (config.publicUrl) {
    try {
      const url = new URL(config.publicUrl);
      return isAllowedWebAuthnUrl(url) ? { rpID: url.hostname, expectedOrigin: url.origin, rpName: 'Coinio' } : null;
    } catch {
      return null;
    }
  }
  const originHeader = typeof req.headers.origin === 'string' ? req.headers.origin : null;
  if (originHeader) {
    try {
      const url = new URL(originHeader);
      return isAllowedWebAuthnUrl(url) ? { rpID: url.hostname, expectedOrigin: url.origin, rpName: 'Coinio' } : null;
    } catch {
      return null;
    }
  }
  const host = typeof req.headers.host === 'string' ? req.headers.host : null;
  if (!host) return null;
  const protoHeader = typeof req.headers['x-forwarded-proto'] === 'string' ? req.headers['x-forwarded-proto'].split(',')[0]?.trim() : null;
  const proto = protoHeader || (req.secure ? 'https' : 'http');
  try {
    const url = new URL(`${proto}://${host}`);
    return isAllowedWebAuthnUrl(url) ? { rpID: url.hostname, expectedOrigin: url.origin, rpName: 'Coinio' } : null;
  } catch {
    return null;
  }
}

/** Single-use, TTL-bound, capped in-memory challenge store for registration and login ceremonies. */
export function createChallengeStore() {
  const store = new Map<string, ChallengeEntry>();

  function prune(nowMs: number): void {
    for (const [key, val] of store) {
      if (val.expiresAt <= nowMs) store.delete(key);
    }
    while (store.size >= MAX_CHALLENGES) {
      const oldest = store.keys().next().value;
      if (oldest === undefined) break;
      store.delete(oldest);
    }
  }

  return {
    issue(now: Date, entry: Omit<ChallengeEntry, 'expiresAt'>): string {
      const nowMs = now.getTime();
      prune(nowMs);
      const token = randomBytes(32).toString('base64url');
      store.set(token, { ...entry, expiresAt: nowMs + CHALLENGE_TTL_MS });
      return token;
    },
    consume(now: Date, token: unknown, kind: 'register' | 'login', userId?: number): ChallengeEntry | null {
      if (typeof token !== 'string' || !token) return null;
      const entry = store.get(token);
      store.delete(token);
      if (!entry || entry.expiresAt <= now.getTime() || entry.kind !== kind) return null;
      if (kind === 'register' && entry.userId !== userId) return null;
      return entry;
    },
  };
}

export function countPasskeys(db: Db, userId: number): number {
  return db.select({ n: count() }).from(passkeys).where(eq(passkeys.userId, userId)).get()?.n ?? 0;
}

export function listPasskeys(db: Db, userId: number): PasskeyMeta[] {
  return db
    .select({
      id: passkeys.id,
      name: passkeys.name,
      deviceType: passkeys.deviceType,
      backedUp: passkeys.backedUp,
      createdAt: passkeys.createdAt,
      lastUsedAt: passkeys.lastUsedAt,
    })
    .from(passkeys)
    .where(eq(passkeys.userId, userId))
    .orderBy(desc(passkeys.createdAt))
    .all();
}
