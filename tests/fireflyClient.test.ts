import { describe, expect, it } from 'vitest';
import type { ServiceCtx } from '../src/server/services/context.js';
import { FireflyError, createWithdrawal, getBill, listBills, type FfBill } from '../src/server/services/firefly/client.js';
import { fakeFirefly } from './fixtures/fakeFirefly.js';
import { makeTestApp } from './helpers.js';

const conn = { baseUrl: 'https://ff.example.com', token: 'tok' };

const bill = (id: string, over: Partial<FfBill> = {}): FfBill => ({
  id, name: `Bill ${id}`, amountMin: '9.99', amountMax: '9.99', currencyCode: 'EUR', date: '2026-01-09', repeatFreq: 'monthly',
  skip: 0, active: true, notes: null, updatedAt: '2026-11-01T00:00:00+00:00', nextExpectedMatch: '2026-12-09', ...over,
});

function setup(seed: Parameters<typeof fakeFirefly>[0] = {}, config: { blockPrivateNetworks?: boolean } = {}) {
  const fake = fakeFirefly({ token: 'tok', ...seed });
  const t = makeTestApp({ config });
  const ctx: ServiceCtx = { db: t.db, config: t.config, fetch: fake.fetch, now: () => t.clock.now, lookup: async () => [{ address: '93.184.216.34', family: 4 }] };
  return { fake, ctx };
}

describe('firefly client', () => {
  it('listBills reads every page', async () => {
    const { ctx } = setup({ bills: ['1', '2', '3', '4', '5'].map((id) => bill(id)) });
    const bills = await listBills(ctx, conn);
    expect(bills.map((b) => b.id)).toEqual(['1', '2', '3', '4', '5']);
    expect(bills[0]).toEqual(bill('1'));
  });

  it('401 becomes FireflyError unauthorized', async () => {
    const { ctx } = setup();
    const err = await listBills(ctx, { ...conn, token: 'wrong' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FireflyError);
    expect(err).toMatchObject({ status: 401, code: 'unauthorized' });
    expect((err as Error).message).not.toContain('wrong');
  });

  it('getBill returns null on 404', async () => {
    const { ctx, fake } = setup({ bills: [bill('1'), bill('2')] });
    fake.bills.delete('2');
    expect(await getBill(ctx, conn, '2')).toBeNull();
    expect(await getBill(ctx, conn, '1')).toEqual(bill('1'));
  });

  it('createWithdrawal posts one split and returns its journal', async () => {
    const { ctx, fake } = setup({ bills: [bill('3')] });
    const j = await createWithdrawal(ctx, conn, {
      date: '2026-11-09', amount: '9.99', currency_code: 'EUR', description: 'Netflix', source_id: '1', destination_name: 'Netflix', bill_id: '3',
    });
    const body = fake.calls.at(-1)!.body as { transactions: { bill_id: string }[] };
    expect(body.transactions).toHaveLength(1);
    expect(body.transactions[0]!.bill_id).toBe('3');
    expect(j).toMatchObject({ date: '2026-11-09', amount: '9.99', currencyCode: 'EUR', billId: '3', foreignAmount: null });
    expect(fake.journals).toContainEqual(j);
  });

  it('sends bearer and vnd.api+json accept', async () => {
    const seen: Headers[] = [];
    const { ctx, fake } = setup();
    ctx.fetch = (async (url: string, init?: RequestInit) => {
      seen.push(new Headers(init?.headers));
      return fake.fetch(url, init);
    }) as typeof fetch;
    await listBills(ctx, conn);
    expect(seen[0]!.get('authorization')).toBe('Bearer tok');
    expect(seen[0]!.get('accept')).toBe('application/vnd.api+json');
  });

  it('blocked private address becomes unreachable', async () => {
    const { ctx, fake } = setup({}, { blockPrivateNetworks: true });
    const err = await listBills(ctx, { ...conn, baseUrl: 'http://192.168.1.5' }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(FireflyError);
    expect(err).toMatchObject({ code: 'unreachable' });
    expect(fake.calls).toHaveLength(0);
  });
});
