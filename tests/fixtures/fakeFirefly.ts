import type { FfBill, FfBillWrite, FfJournal, FfWithdrawal } from '../../src/server/services/firefly/client.js';

type Account = { id: string; name: string; currencyCode: string };
const PAGE_SIZE = 2;

/** An in-memory Firefly III API v1 answering in its JSON:API shape, with lists paged by two. */
export function fakeFirefly(
  seed: { bills?: FfBill[]; journals?: FfJournal[]; accounts?: Account[]; token?: string } = {},
  now: () => Date = () => new Date('2026-11-18T09:00:00Z'),
) {
  const token = seed.token ?? 'token';
  const bills = new Map((seed.bills ?? []).map((b) => [b.id, { ...b }]));
  const journals: FfJournal[] = (seed.journals ?? []).map((j) => ({ ...j }));
  const accounts = seed.accounts ?? [];
  const calls: { method: string; path: string; body: unknown }[] = [];
  let failStatus: number | null = null;
  const nextId = (ids: string[]) => String(Math.max(0, ...ids.map(Number).filter(Number.isFinite)) + 1);

  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/vnd.api+json' } });
  const notFound = () => json(404, { message: 'Resource not found', exception: 'NotFoundHttpException' });
  const billRes = (b: FfBill) => ({
    id: b.id, type: 'bills',
    attributes: {
      name: b.name, amount_min: b.amountMin, amount_max: b.amountMax, currency_code: b.currencyCode, date: b.date, repeat_freq: b.repeatFreq,
      skip: b.skip, active: b.active, notes: b.notes, updated_at: b.updatedAt, next_expected_match: b.nextExpectedMatch,
    },
  });
  const groupRes = (groupId: string) => ({
    id: groupId, type: 'transactions',
    attributes: {
      updated_at: now().toISOString(),
      transactions: journals.filter((j) => j.groupId === groupId).map((j) => ({
        transaction_journal_id: j.journalId, type: 'withdrawal', date: j.date, amount: j.amount, currency_code: j.currencyCode,
        foreign_amount: j.foreignAmount, foreign_currency_code: j.foreignCurrencyCode, bill_id: j.billId,
      })),
    },
  });
  const page = (url: URL, items: unknown[]) => {
    const total = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
    const current = Math.min(Math.max(1, Number(url.searchParams.get('page') ?? 1)), total);
    return json(200, {
      data: items.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE),
      meta: { pagination: { total: items.length, count: PAGE_SIZE, per_page: PAGE_SIZE, current_page: current, total_pages: total } },
    });
  };
  const writeBill = (b: FfBill, w: Partial<FfBillWrite>): FfBill => ({
    ...b,
    ...(w.name !== undefined && { name: w.name }),
    ...(w.amount_min !== undefined && { amountMin: w.amount_min }),
    ...(w.amount_max !== undefined && { amountMax: w.amount_max }),
    ...(w.currency_code !== undefined && { currencyCode: w.currency_code }),
    ...(w.date !== undefined && { date: w.date }),
    ...(w.repeat_freq !== undefined && { repeatFreq: w.repeat_freq }),
    ...(w.skip !== undefined && { skip: w.skip }),
    ...(w.active !== undefined && { active: w.active }),
    ...(w.notes !== undefined && { notes: w.notes }),
    updatedAt: now().toISOString(),
  });

  const handle = (method: string, url: URL, body: unknown, auth: string | null): Response => {
    if (failStatus !== null) {
      const status = failStatus;
      failStatus = null;
      return json(status, { message: `Failed with ${status}` });
    }
    if (auth !== `Bearer ${token}`) return json(401, { message: 'Unauthenticated.', exception: 'AuthenticationException' });
    const path = url.pathname.replace(/^\/api\/v1/, '');
    const billMatch = path.match(/^\/bills\/([^/]+)(\/transactions)?$/);
    if (method === 'GET' && path === '/about') return json(200, { data: { version: '6.1.21', api_version: '6.1.21', php_version: '8.3.0', os: 'Linux' } });
    if (method === 'GET' && path === '/accounts') {
      const type = url.searchParams.get('type');
      return page(url, (type && type !== 'asset' ? [] : accounts).map((a) => ({ id: a.id, type: 'accounts', attributes: { name: a.name, type: 'asset', currency_code: a.currencyCode } })));
    }
    if (method === 'GET' && path === '/bills') return page(url, [...bills.values()].map(billRes));
    if (method === 'POST' && path === '/bills') {
      const w = body as FfBillWrite;
      const id = nextId([...bills.keys()]);
      const created = writeBill({ id, name: '', amountMin: '0', amountMax: '0', currencyCode: 'EUR', date: '', repeatFreq: 'monthly', skip: 0, active: true, notes: null, updatedAt: '', nextExpectedMatch: null }, w);
      bills.set(id, created);
      return json(200, { data: billRes(created) });
    }
    if (billMatch) {
      const b = bills.get(billMatch[1]!);
      if (!b) return notFound();
      if (billMatch[2] && method === 'GET') {
        const start = url.searchParams.get('start') ?? '0000-00-00';
        const end = url.searchParams.get('end') ?? '9999-99-99';
        const groupIds = [...new Set(journals.filter((j) => j.billId === b.id && j.date.slice(0, 10) >= start && j.date.slice(0, 10) <= end).map((j) => j.groupId))];
        return page(url, groupIds.map(groupRes));
      }
      if (!billMatch[2] && method === 'GET') return json(200, { data: billRes(b) });
      if (!billMatch[2] && method === 'PUT') {
        const updated = writeBill(b, body as Partial<FfBillWrite>);
        bills.set(b.id, updated);
        return json(200, { data: billRes(updated) });
      }
    }
    if (method === 'POST' && path === '/transactions') {
      const t = (body as { transactions: FfWithdrawal[] }).transactions[0]!;
      const groupId = nextId(journals.map((j) => j.groupId));
      journals.push({
        groupId, journalId: nextId(journals.map((j) => j.journalId)), date: t.date, amount: t.amount, currencyCode: t.currency_code,
        foreignAmount: t.foreign_amount ?? null, foreignCurrencyCode: t.foreign_currency_code ?? null, billId: t.bill_id ?? null,
      });
      return json(200, { data: groupRes(groupId) });
    }
    return notFound();
  };

  const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const method = (init?.method ?? 'GET').toUpperCase();
    const body = typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined;
    calls.push({ method, path: url.pathname + url.search, body });
    return handle(method, url, body, new Headers(init?.headers).get('authorization'));
  }) as typeof fetch;

  return { fetch: fakeFetch, bills, journals, calls, failNext: (status: number) => void (failStatus = status) };
}
