import { describe, expect, it } from 'vitest';
import type { ApiPayment, ApiSubscription } from '../lib/types';
import { projectMonth } from './projection';

const sub = (over: Partial<ApiSubscription> = {}): ApiSubscription => ({
  id: 1, name: 'Netflix', domain: null, logoPath: null, amountMinor: 19999, currency: 'TRY', variableAmount: false,
  cycle: 'monthly', intervalCount: 1, anchorDay: 22, nextDue: '2026-11-22', autoPay: true, paymentMethod: null,
  category: null, notes: null, reminderDays: 1, active: true, createdAt: '', updatedAt: '', ...over,
});
const pay = (over: Partial<ApiPayment> & Pick<ApiPayment, 'dueDate'>): ApiPayment => ({
  id: 9, subscriptionId: 1, paidAt: `${over.dueDate}T08:00:00Z`, amountMinor: 19999, currency: 'TRY',
  actualBaseMinor: null, source: 'manual', status: 'paid', ...over,
});
const rates = { base: 'TRY', rates: { USD: 42.5 } };

describe('projectMonth', () => {
  it('projectMonth puts monthly 31st on Feb 28', () => {
    const days = projectMonth([sub({ anchorDay: 31, nextDue: '2027-01-31' })], [], '2027-02', '2026-11-18', rates);
    expect(Object.keys(days)).toEqual(['2027-02-28']);
    expect(days['2027-02-28']).toEqual([{ subscriptionId: 1, dueDate: '2027-02-28', state: 'projected', baseMinor: 19999 }]);
  });

  it('projectMonth marks past unpaid manual as overdue', () => {
    const days = projectMonth(
      [sub({ autoPay: false, anchorDay: 10, nextDue: '2026-11-10' }), sub({ id: 2, anchorDay: 5, nextDue: '2026-11-05' })],
      [],
      '2026-11',
      '2026-11-18',
      rates,
    );
    expect(days['2026-11-10']?.[0]?.state).toBe('overdue');
    // A past auto-pay date without a record is left to the auto-pay job, not shown.
    expect(days['2026-11-05']).toBeUndefined();
  });

  it('marks the open period due, later ones projected, and uses payments for settled dates', () => {
    const days = projectMonth(
      [sub({ currency: 'USD', amountMinor: 1000, anchorDay: 3, nextDue: '2026-12-03', cycle: 'weekly' })],
      [pay({ dueDate: '2026-11-26', amountMinor: 1000, currency: 'USD', actualBaseMinor: 43000 }), pay({ id: 10, dueDate: '2026-11-19', status: 'skipped', amountMinor: 0 }), pay({ id: 11, dueDate: '2026-11-12', status: 'void' })],
      '2026-11',
      '2026-11-30',
      rates,
    );
    expect(days['2026-11-26']).toEqual([{ subscriptionId: 1, dueDate: '2026-11-26', state: 'paid', baseMinor: 43000, paymentId: 9 }]);
    expect(days['2026-11-19']?.[0]).toMatchObject({ state: 'skipped', baseMinor: 0, paymentId: 10 });
    expect(days['2026-11-12']).toBeUndefined();
    const dec = projectMonth([sub({ currency: 'USD', amountMinor: 1000, anchorDay: 3, nextDue: '2026-12-03', cycle: 'weekly' })], [], '2026-12', '2026-11-30', rates);
    expect(dec['2026-12-03']?.[0]).toMatchObject({ state: 'due', baseMinor: 42500 });
    expect(dec['2026-12-10']?.[0]?.state).toBe('projected');
  });

  it('ignores paused subscriptions and unknown currencies give null', () => {
    const days = projectMonth([sub({ active: false }), sub({ id: 2, currency: 'GBP', nextDue: '2026-11-25' })], [], '2026-11', '2026-11-18', rates);
    expect(Object.keys(days)).toEqual(['2026-11-25']);
    expect(days['2026-11-25']?.[0]?.baseMinor).toBeNull();
  });
});
