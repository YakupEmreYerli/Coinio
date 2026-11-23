import { describe, expect, it } from 'vitest';
import { computeEqualSplits, resolveSplits, validateSplits } from '../src/server/domain/family.js';
import { computeReport } from '../src/server/domain/report.js';
import { computeSummary, type PaymentRow, type SubscriptionRow } from '../src/server/domain/summary.js';

const baseSub = (overrides: Partial<SubscriptionRow> = {}): SubscriptionRow => ({
  id: 1,
  userId: 1,
  householdId: 10,
  paidByMemberId: 1,
  name: 'Family Plan',
  domain: null,
  logoPath: null,
  amountMinor: 1000,
  currency: 'USD',
  variableAmount: false,
  cycle: 'monthly',
  intervalCount: 1,
  anchorDay: 15,
  nextDue: '2026-05-15',
  autoPay: true,
  paymentMethod: null,
  category: 'Media',
  notes: null,
  reminderOffsets: null,
  trialEndsAt: null,
  active: true,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  ...overrides,
});

const basePay = (overrides: Partial<PaymentRow> = {}): PaymentRow => ({
  id: 1,
  subscriptionId: 1,
  dueDate: '2026-05-15',
  paidAt: '2026-05-15T10:00:00Z',
  amountMinor: 1000,
  currency: 'USD',
  actualBaseMinor: null,
  source: 'manual',
  status: 'paid',
  ...overrides,
});

describe('family split domain', () => {
  it('distributes remainder cents deterministically to lowest member ids', () => {
    const splits = computeEqualSplits(1000, [30, 10, 20]);
    expect([...splits.entries()]).toEqual([
      [10, 334],
      [20, 333],
      [30, 333],
    ]);
    expect(computeEqualSplits(0, [2, 1]).get(1)).toBe(0);
    expect(computeEqualSplits(500, [7]).get(7)).toBe(500);
    expect(computeEqualSplits(500, []).size).toBe(0);
  });

  it('resolves empty and null splits equally across members and keeps explicit shares', () => {
    expect([...resolveSplits(900, [], [1, 2, 3]).values()]).toEqual([300, 300, 300]);
    expect([
      ...resolveSplits(
        900,
        [
          { memberId: 2, shareMinor: null },
          { memberId: 1, shareMinor: null },
        ],
        [1, 2, 3],
      ).entries(),
    ]).toEqual([
      [1, 450],
      [2, 450],
    ]);
    expect([
      ...resolveSplits(
        1000,
        [
          { memberId: 1, shareMinor: 700 },
          { memberId: 2, shareMinor: 300 },
        ],
        [1, 2],
      ).entries(),
    ]).toEqual([
      [1, 700],
      [2, 300],
    ]);
  });

  it('validates split inputs against member membership, duplicates, modes and sums', () => {
    const members = new Set([1, 2, 3]);
    expect(validateSplits(1000, [], members)).toEqual({ ok: false, error: 'splits_empty' });
    expect(validateSplits(1000, [{ memberId: 99, shareMinor: null }], members)).toEqual({ ok: false, error: 'invalid_member' });
    expect(
      validateSplits(
        1000,
        [
          { memberId: 1, shareMinor: null },
          { memberId: 1, shareMinor: null },
        ],
        members,
      ),
    ).toEqual({ ok: false, error: 'duplicate_member' });
    expect(
      validateSplits(
        1000,
        [
          { memberId: 1, shareMinor: null },
          { memberId: 2, shareMinor: 500 },
        ],
        members,
      ),
    ).toEqual({ ok: false, error: 'mixed_split_mode' });
    expect(
      validateSplits(
        1000,
        [
          { memberId: 1, shareMinor: -1 },
          { memberId: 2, shareMinor: 1001 },
        ],
        members,
      ),
    ).toEqual({ ok: false, error: 'invalid_share_amount' });
    expect(
      validateSplits(
        1000,
        [
          { memberId: 1, shareMinor: 600 },
          { memberId: 2, shareMinor: 300 },
        ],
        members,
      ),
    ).toEqual({ ok: false, error: 'split_sum_mismatch' });
    expect(
      validateSplits(
        1000,
        [
          { memberId: 1, shareMinor: 600 },
          { memberId: 2, shareMinor: 400 },
        ],
        members,
      ),
    ).toEqual({ ok: true });
  });

  it('applies amountOverrides proportionally in computeSummary', () => {
    const subs = [baseSub({ id: 1, amountMinor: 1000 }), baseSub({ id: 2, amountMinor: 500, householdId: null })];
    const payments = [basePay({ id: 1, subscriptionId: 1, dueDate: '2026-05-15', amountMinor: 1000 })];
    const rates = { base: 'USD', date: '2026-05-01', stale: false, rates: {} };
    const overrides = new Map([[1, 250]]);

    const summary = computeSummary({ subs, payments, today: '2026-05-01', rates, amountOverrides: overrides });
    expect(summary.monthlyAverageMinor).toBe(750);
    expect(summary.yearlyTotalMinor).toBe(9000);
    expect(summary.paidThisMonth[0]?.amountMinor).toBe(250);
    expect(summary.upcoming.find((u) => u.subscriptionId === 1)?.amountMinor).toBe(250);
  });

  it('applies amountOverrides and builds byMember breakdown in computeReport', () => {
    const subs = [baseSub({ id: 1, amountMinor: 1000 })];
    const payments = [basePay({ id: 1, subscriptionId: 1, dueDate: '2026-04-15', amountMinor: 1000 })];
    const rates = { base: 'USD', date: '2026-05-01', stale: false, rates: {} };

    const report = computeReport({
      subs,
      payments,
      today: '2026-05-01',
      rates,
      amountOverrides: new Map([[1, 400]]),
      memberBreakdown: {
        members: [
          { id: 1, name: 'Yakup', color: '#4f46e5' },
          { id: 2, name: 'Annem', color: null },
        ],
        memberAmounts: new Map([
          [1, new Map([[1, 400]])],
          [2, new Map([[1, 600]])],
        ]),
      },
    });

    expect(report.top[0]?.monthlyMinor).toBe(400);
    expect(report.months.find((m) => m.month === '2026-04')?.paidMinor).toBe(400);
    expect(report.byMember).toEqual([
      { memberId: 2, name: 'Annem', color: null, monthlyMinor: 600 },
      { memberId: 1, name: 'Yakup', color: '#4f46e5', monthlyMinor: 400 },
    ]);
  });
});
