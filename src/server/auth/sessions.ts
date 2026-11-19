import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt, lte, ne } from 'drizzle-orm';
import type { Db } from '../db/client.js';
import { sessions } from '../db/schema.js';

export const SESSION_COOKIE = 'sid';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const hashId = (id: string) => createHash('sha256').update(id).digest('hex');

export function createSession(db: Db, userId: number, now: Date): string {
  const id = randomBytes(32).toString('base64url');
  db.delete(sessions).where(lte(sessions.expiresAt, now.toISOString())).run();
  db.insert(sessions)
    .values({ idHash: hashId(id), userId, expiresAt: new Date(now.getTime() + SESSION_TTL_MS).toISOString() })
    .run();
  return id;
}

export function findSessionUserId(db: Db, id: string, now: Date): number | null {
  const row = db
    .select({ userId: sessions.userId })
    .from(sessions)
    .where(and(eq(sessions.idHash, hashId(id)), gt(sessions.expiresAt, now.toISOString())))
    .get();
  return row?.userId ?? null;
}

export function deleteSession(db: Db, id: string): void {
  db.delete(sessions).where(eq(sessions.idHash, hashId(id))).run();
}

/** Signs out every other device of the user, keeping the given session. */
export function deleteOtherSessions(db: Db, userId: number, keepId: string): void {
  db.delete(sessions).where(and(eq(sessions.userId, userId), ne(sessions.idHash, hashId(keepId)))).run();
}
