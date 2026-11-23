import { createHash, randomBytes } from 'node:crypto';
import { and, asc, eq, gt, inArray, isNull } from 'drizzle-orm';
import { z } from 'zod';
import type { FamilyRelation } from '../../shared/types.js';
import { hashPassword } from '../auth/password.js';
import type { Db } from '../db/client.js';
import {
  householdInvites,
  householdMembers,
  households,
  subscriptionSplits,
  subscriptions,
  users,
} from '../db/schema.js';
import { INVITE_TTL_DAYS, MAX_FAMILY_MEMBERS } from '../domain/family.js';
import { inviteSignupAllowed, userAllowed } from '../plugins.js';
import type { ServiceCtx } from './context.js';
import {
  BadRequestError,
  ConflictError,
  ForbiddenError,
  GoneError,
  NotFoundError,
  UnauthorizedError,
} from './errors.js';

export type HouseholdRow = typeof households.$inferSelect;
export type HouseholdMemberRow = typeof householdMembers.$inferSelect;
export type HouseholdContext = {
  household: HouseholdRow;
  me: HouseholdMemberRow;
  members: HouseholdMemberRow[];
};

const MEMBER_PALETTE = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#8b5cf6', '#ef4444', '#14b8a6'];

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export function getHouseholdContext(db: Db, userId: number): HouseholdContext | null {
  const me = db.select().from(householdMembers).where(eq(householdMembers.linkedUserId, userId)).get();
  if (!me) return null;
  const household = db.select().from(households).where(eq(households.id, me.householdId)).get();
  if (!household) return null;
  const members = db
    .select()
    .from(householdMembers)
    .where(eq(householdMembers.householdId, household.id))
    .orderBy(asc(householdMembers.id))
    .all();
  return { household, me, members };
}

function requireHousehold(db: Db, userId: number): HouseholdContext {
  const hh = getHouseholdContext(db, userId);
  if (!hh) throw new NotFoundError('household');
  return hh;
}

function requireOwner(db: Db, userId: number): HouseholdContext {
  const hh = requireHousehold(db, userId);
  if (hh.me.role !== 'owner') throw new ForbiddenError('owner_required');
  return hh;
}

/** Detaches all shared subscriptions in `householdId` so each creator retains their own personal subscription. */
export function dissolveHouseholdTx(tx: Db, householdId: number): void {
  const sharedSubs = tx
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(eq(subscriptions.householdId, householdId))
    .all();
  const ids = sharedSubs.map((s) => s.id);
  if (ids.length > 0) {
    tx.delete(subscriptionSplits).where(inArray(subscriptionSplits.subscriptionId, ids)).run();
    tx.update(subscriptions).set({ householdId: null, paidByMemberId: null }).where(eq(subscriptions.householdId, householdId)).run();
  }
  tx.delete(households).where(eq(households.id, householdId)).run();
}

export function getFamilyState(ctx: ServiceCtx, userId: number) {
  const allowInviteSignup = inviteSignupAllowed(ctx.plugins);
  const hh = getHouseholdContext(ctx.db, userId);
  if (!hh) {
    return { household: null, members: [], invites: [], allowInviteSignup };
  }

  const linkedIds = hh.members.map((m) => m.linkedUserId).filter((id): id is number => id !== null);
  const usernames = new Map<number, string>();
  if (linkedIds.length > 0) {
    for (const u of ctx.db.select({ id: users.id, username: users.username }).from(users).where(inArray(users.id, linkedIds)).all()) {
      usernames.set(u.id, u.username);
    }
  }

  const nowIso = ctx.now().toISOString();
  const invites =
    hh.me.role === 'owner'
      ? ctx.db
          .select({
            id: householdInvites.id,
            memberId: householdInvites.memberId,
            expiresAt: householdInvites.expiresAt,
            createdAt: householdInvites.createdAt,
          })
          .from(householdInvites)
          .where(
            and(
              eq(householdInvites.householdId, hh.household.id),
              isNull(householdInvites.usedAt),
              gt(householdInvites.expiresAt, nowIso),
            ),
          )
          .orderBy(asc(householdInvites.id))
          .all()
      : [];

  return {
    household: {
      id: hh.household.id,
      name: hh.household.name,
      ownerUserId: hh.household.ownerUserId,
      myMemberId: hh.me.id,
      myRole: hh.me.role,
      createdAt: hh.household.createdAt,
    },
    members: hh.members.map((m) => ({
      id: m.id,
      name: m.name,
      relation: m.relation as FamilyRelation | null,
      color: m.color,
      role: m.role,
      linkedUserId: m.linkedUserId,
      linkedUsername: m.linkedUserId !== null ? (usernames.get(m.linkedUserId) ?? null) : null,
      isMe: m.id === hh.me.id,
      createdAt: m.createdAt,
    })),
    invites,
    allowInviteSignup,
  };
}

export function createFamily(
  ctx: ServiceCtx,
  userId: number,
  input: {
    name: string;
    ownerName?: string;
    ownerRelation?: FamilyRelation | null;
    members?: Array<string | { name: string; relation?: FamilyRelation | null }>;
  },
) {
  if (getHouseholdContext(ctx.db, userId)) throw new ConflictError('already_in_household');
  const user = ctx.db.select({ id: users.id, username: users.username }).from(users).where(eq(users.id, userId)).get();
  if (!user) throw new NotFoundError('user');

  const extra = (input.members ?? [])
    .map((entry) => (typeof entry === 'string' ? { name: entry.trim(), relation: null } : { name: entry.name.trim(), relation: entry.relation ?? null }))
    .filter((entry) => entry.name.length > 0);
  if (1 + extra.length > MAX_FAMILY_MEMBERS) throw new BadRequestError('member_limit_reached');

  const stamp = ctx.now().toISOString();
  ctx.db.transaction((tx) => {
    const hh = tx.insert(households).values({ name: input.name, ownerUserId: userId, createdAt: stamp }).returning().get();
    tx.insert(householdMembers)
      .values({
        householdId: hh.id,
        name: input.ownerName?.trim() || user.username,
        relation: input.ownerRelation ?? null,
        color: MEMBER_PALETTE[0]!,
        role: 'owner',
        linkedUserId: userId,
        createdAt: stamp,
      })
      .run();
    extra.forEach((m, idx) => {
      tx.insert(householdMembers)
        .values({
          householdId: hh.id,
          name: m.name,
          relation: m.relation,
          color: MEMBER_PALETTE[(idx + 1) % MEMBER_PALETTE.length]!,
          role: 'member',
          linkedUserId: null,
          createdAt: stamp,
        })
        .run();
    });
  });

  return getFamilyState(ctx, userId);
}

export function updateFamily(ctx: ServiceCtx, userId: number, input: { name: string }) {
  const hh = requireOwner(ctx.db, userId);
  ctx.db.update(households).set({ name: input.name }).where(eq(households.id, hh.household.id)).run();
  return getFamilyState(ctx, userId);
}

export function deleteFamily(ctx: ServiceCtx, userId: number): void {
  const hh = requireOwner(ctx.db, userId);
  ctx.db.transaction((tx) => dissolveHouseholdTx(tx as unknown as Db, hh.household.id));
}

export function leaveFamily(ctx: ServiceCtx, userId: number): void {
  const hh = requireHousehold(ctx.db, userId);
  if (hh.me.role === 'owner') throw new BadRequestError('owner_cannot_leave');
  ctx.db.transaction((tx) => {
    // Reassign shared subscriptions created by the leaving member so the household keeps its bills.
    tx.update(subscriptions)
      .set({ userId: hh.household.ownerUserId })
      .where(and(eq(subscriptions.householdId, hh.household.id), eq(subscriptions.userId, userId)))
      .run();
    tx.delete(householdInvites)
      .where(and(eq(householdInvites.memberId, hh.me.id), isNull(householdInvites.usedAt)))
      .run();
    tx.update(householdMembers).set({ linkedUserId: null }).where(eq(householdMembers.id, hh.me.id)).run();
  });
}

export function addMember(ctx: ServiceCtx, userId: number, input: { name: string; relation?: FamilyRelation | null; color?: string | null }) {
  const hh = requireOwner(ctx.db, userId);
  if (hh.members.length >= MAX_FAMILY_MEMBERS) throw new ConflictError('member_limit_reached');
  const stamp = ctx.now().toISOString();
  const color = input.color === undefined ? MEMBER_PALETTE[hh.members.length % MEMBER_PALETTE.length]! : input.color;
  ctx.db
    .insert(householdMembers)
    .values({
      householdId: hh.household.id,
      name: input.name,
      relation: input.relation ?? null,
      color,
      role: 'member',
      linkedUserId: null,
      createdAt: stamp,
    })
    .run();
  return getFamilyState(ctx, userId);
}

export function updateMember(
  ctx: ServiceCtx,
  userId: number,
  memberId: number,
  patch: { name?: string; relation?: FamilyRelation | null; color?: string | null },
) {
  const hh = requireHousehold(ctx.db, userId);
  if (hh.me.role !== 'owner' && memberId !== hh.me.id) throw new ForbiddenError('owner_required');
  const target = hh.members.find((m) => m.id === memberId);
  if (!target) throw new NotFoundError('member');
  const set: Partial<typeof householdMembers.$inferInsert> = {};
  if (patch.name !== undefined) set.name = patch.name;
  if (patch.relation !== undefined) set.relation = patch.relation;
  if (patch.color !== undefined) set.color = patch.color;
  if (Object.keys(set).length > 0) {
    ctx.db.update(householdMembers).set(set).where(eq(householdMembers.id, memberId)).run();
  }
  return getFamilyState(ctx, userId);
}

export function deleteMember(ctx: ServiceCtx, userId: number, memberId: number) {
  const hh = requireOwner(ctx.db, userId);
  const target = hh.members.find((m) => m.id === memberId);
  if (!target) throw new NotFoundError('member');
  if (target.id === hh.me.id || target.role === 'owner') throw new BadRequestError('cannot_delete_owner');

  ctx.db.transaction((tx) => {
    const affectedSubs = tx
      .select({ subscriptionId: subscriptionSplits.subscriptionId })
      .from(subscriptionSplits)
      .where(eq(subscriptionSplits.memberId, memberId))
      .all()
      .map((r) => r.subscriptionId);

    tx.delete(householdMembers).where(eq(householdMembers.id, memberId)).run();

    for (const subId of affectedSubs) {
      const sub = tx.select({ amountMinor: subscriptions.amountMinor }).from(subscriptions).where(eq(subscriptions.id, subId)).get();
      if (!sub) continue;
      const remaining = tx.select().from(subscriptionSplits).where(eq(subscriptionSplits.subscriptionId, subId)).all();
      const customSum = remaining.reduce((acc, s) => acc + (s.shareMinor ?? 0), 0);
      if (remaining.length > 0 && remaining.some((s) => s.shareMinor !== null) && customSum !== sub.amountMinor) {
        // Remaining custom shares no longer match the subscription price, so revert to equal split.
        tx.update(subscriptionSplits).set({ shareMinor: null }).where(eq(subscriptionSplits.subscriptionId, subId)).run();
      }
    }
  });

  return getFamilyState(ctx, userId);
}

export function createInvite(ctx: ServiceCtx, userId: number, memberId: number) {
  const hh = requireOwner(ctx.db, userId);
  const target = hh.members.find((m) => m.id === memberId);
  if (!target) throw new NotFoundError('member');
  if (target.linkedUserId !== null) throw new ConflictError('member_already_linked');

  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const now = ctx.now();
  const createdAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + INVITE_TTL_DAYS * 86_400_000).toISOString();

  const row = ctx.db.transaction((tx) => {
    tx.delete(householdInvites)
      .where(and(eq(householdInvites.memberId, memberId), isNull(householdInvites.usedAt)))
      .run();
    return tx
      .insert(householdInvites)
      .values({
        householdId: hh.household.id,
        memberId,
        tokenHash,
        createdByUserId: userId,
        expiresAt,
        createdAt,
      })
      .returning()
      .get();
  });

  return {
    id: row.id,
    memberId: row.memberId,
    token,
    path: `/invite/${token}`,
    expiresAt: row.expiresAt,
  };
}

export function revokeInvite(ctx: ServiceCtx, userId: number, inviteId: number): void {
  const hh = requireOwner(ctx.db, userId);
  const info = ctx.db
    .delete(householdInvites)
    .where(and(eq(householdInvites.id, inviteId), eq(householdInvites.householdId, hh.household.id), isNull(householdInvites.usedAt)))
    .run();
  if (info.changes === 0) throw new NotFoundError('invite');
}

export function previewInvite(ctx: ServiceCtx, rawToken: string, sessionUserId: number | null) {
  const allowInviteSignup = inviteSignupAllowed(ctx.plugins);
  const signedIn = sessionUserId !== null && userAllowed(ctx, sessionUserId);
  const alreadyInHousehold = signedIn ? getHouseholdContext(ctx.db, sessionUserId!) !== null : false;

  const row = ctx.db
    .select({
      invite: householdInvites,
      householdName: households.name,
      memberLinkedUserId: householdMembers.linkedUserId,
      memberName: householdMembers.name,
      memberRelation: householdMembers.relation,
    })
    .from(householdInvites)
    .innerJoin(households, eq(householdInvites.householdId, households.id))
    .innerJoin(householdMembers, eq(householdInvites.memberId, householdMembers.id))
    .where(eq(householdInvites.tokenHash, hashToken(rawToken)))
    .get();

  if (!row) {
    return {
      valid: false,
      expired: false,
      used: false,
      householdName: null,
      memberName: null,
      memberRelation: null,
      allowInviteSignup,
      signedIn,
      alreadyInHousehold,
    };
  }

  const used = row.invite.usedAt !== null || row.memberLinkedUserId !== null;
  const expired = row.invite.expiresAt <= ctx.now().toISOString();
  return {
    valid: !used && !expired,
    expired,
    used,
    householdName: row.householdName,
    memberName: row.memberName,
    memberRelation: (row.memberRelation ?? null) as FamilyRelation | null,
    allowInviteSignup,
    signedIn,
    alreadyInHousehold,
  };
}

const InviteSignupBody = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(10).max(1000),
});

export async function acceptInvite(
  ctx: ServiceCtx,
  rawToken: string,
  opts: {
    sessionUserId: number | null;
    username?: string;
    password?: string;
    displayName?: string;
    relation?: FamilyRelation | null;
  },
): Promise<{ userId: number; username?: string; householdId: number; memberId: number; created: boolean }> {
  const invite = ctx.db
    .select()
    .from(householdInvites)
    .where(eq(householdInvites.tokenHash, hashToken(rawToken)))
    .get();
  if (!invite) throw new NotFoundError('invite');

  const nowIso = ctx.now().toISOString();
  if (invite.usedAt !== null) throw new ConflictError('invite_used');
  if (invite.expiresAt <= nowIso) throw new GoneError('invite_expired');

  const profilePatch: Partial<typeof householdMembers.$inferInsert> = {};
  if (opts.displayName?.trim()) profilePatch.name = opts.displayName.trim();
  if (opts.relation !== undefined) profilePatch.relation = opts.relation;

  if (opts.sessionUserId !== null) {
    const uid = opts.sessionUserId;
    if (!userAllowed(ctx, uid)) throw new ForbiddenError('suspended');
    ctx.db.transaction((tx) => {
      if (getHouseholdContext(tx as unknown as Db, uid)) throw new ConflictError('already_in_household');
      const claimed = tx
        .update(householdInvites)
        .set({ usedAt: nowIso, usedByUserId: uid })
        .where(and(eq(householdInvites.id, invite.id), isNull(householdInvites.usedAt), gt(householdInvites.expiresAt, nowIso)))
        .run();
      if (claimed.changes !== 1) throw new ConflictError('invite_used');
      const linked = tx
        .update(householdMembers)
        .set({ linkedUserId: uid, ...profilePatch })
        .where(and(eq(householdMembers.id, invite.memberId), isNull(householdMembers.linkedUserId)))
        .run();
      if (linked.changes !== 1) throw new ConflictError('member_already_linked');
    });
    return { userId: uid, householdId: invite.householdId, memberId: invite.memberId, created: false };
  }

  if (!inviteSignupAllowed(ctx.plugins)) throw new UnauthorizedError('auth_required');
  const parsed = InviteSignupBody.safeParse({ username: opts.username, password: opts.password });
  if (!parsed.success) throw new BadRequestError('invalid_credentials');
  const { username, password } = parsed.data;
  if (ctx.db.select({ id: users.id }).from(users).where(eq(users.username, username)).get()) {
    throw new ConflictError('username_taken');
  }

  const passwordHash = await hashPassword(password);
  const createdUser = ctx.db.transaction((tx) => {
    if (tx.select({ id: users.id }).from(users).where(eq(users.username, username)).get()) {
      throw new ConflictError('username_taken');
    }
    const user = tx.insert(users).values({ username, passwordHash, createdAt: nowIso }).returning().get();
    const claimed = tx
      .update(householdInvites)
      .set({ usedAt: nowIso, usedByUserId: user.id })
      .where(and(eq(householdInvites.id, invite.id), isNull(householdInvites.usedAt), gt(householdInvites.expiresAt, nowIso)))
      .run();
    if (claimed.changes !== 1) throw new ConflictError('invite_used');
    const linked = tx
      .update(householdMembers)
      .set({ linkedUserId: user.id, ...profilePatch })
      .where(and(eq(householdMembers.id, invite.memberId), isNull(householdMembers.linkedUserId)))
      .run();
    if (linked.changes !== 1) throw new ConflictError('member_already_linked');
    return user;
  });

  return {
    userId: createdUser.id,
    username: createdUser.username,
    householdId: invite.householdId,
    memberId: invite.memberId,
    created: true,
  };
}
