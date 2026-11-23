export const MAX_FAMILY_MEMBERS = 12;
export const INVITE_TTL_DAYS = 7;

/**
 * Splits `amountMinor` evenly across sorted unique `memberIds`.
 * Any remainder cents go +1 to the lowest member IDs so the total matches `amountMinor` exactly.
 */
export function computeEqualSplits(amountMinor: number, memberIds: ReadonlyArray<number>): Map<number, number> {
  const sorted = [...new Set(memberIds)].sort((a, b) => a - b);
  const result = new Map<number, number>();
  const n = sorted.length;
  if (n === 0) return result;
  const base = Math.floor(amountMinor / n);
  const rem = amountMinor % n;
  for (let i = 0; i < n; i++) {
    result.set(sorted[i]!, i < rem ? base + 1 : base);
  }
  return result;
}

export type SplitRecord = { memberId: number; shareMinor: number | null };

/**
 * Resolves effective per-member amounts for a shared subscription.
 * Empty `splits` divides equally across `allMemberIds`; `shareMinor: null` divides equally among the listed members.
 */
export function resolveSplits(
  amountMinor: number,
  splits: ReadonlyArray<SplitRecord>,
  allMemberIds: ReadonlyArray<number>,
): Map<number, number> {
  if (splits.length === 0) return computeEqualSplits(amountMinor, allMemberIds);
  if (splits.every((s) => s.shareMinor === null)) {
    return computeEqualSplits(
      amountMinor,
      splits.map((s) => s.memberId),
    );
  }
  const result = new Map<number, number>();
  for (const s of splits) {
    result.set(s.memberId, s.shareMinor ?? 0);
  }
  return result;
}

export function validateSplits(
  amountMinor: number,
  splits: ReadonlyArray<{ memberId: number; shareMinor?: number | null }>,
  validMemberIds: ReadonlySet<number>,
): { ok: true } | { ok: false; error: string } {
  if (splits.length === 0) return { ok: false, error: 'splits_empty' };
  const seen = new Set<number>();
  let hasNull = false;
  let hasNumber = false;
  let sum = 0;

  for (const entry of splits) {
    if (!validMemberIds.has(entry.memberId)) return { ok: false, error: 'invalid_member' };
    if (seen.has(entry.memberId)) return { ok: false, error: 'duplicate_member' };
    seen.add(entry.memberId);

    if (entry.shareMinor === undefined || entry.shareMinor === null) {
      hasNull = true;
    } else {
      hasNumber = true;
      if (!Number.isSafeInteger(entry.shareMinor) || entry.shareMinor < 0) {
        return { ok: false, error: 'invalid_share_amount' };
      }
      sum += entry.shareMinor;
    }
  }

  if (hasNull && hasNumber) return { ok: false, error: 'mixed_split_mode' };
  if (hasNumber && sum !== amountMinor) return { ok: false, error: 'split_sum_mismatch' };
  return { ok: true };
}
