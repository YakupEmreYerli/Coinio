// Firefly III API v1 client. Every request goes through guardedFetch; the token never appears in errors.
import type { ServiceCtx } from '../context.js';
import { guardedFetch } from '../netGuard.js';

/** `baseUrl` has no trailing `/` and no `/api`. */
export type FireflyConn = { baseUrl: string; token: string };

export type FireflyErrorCode = 'unauthorized' | 'not_found' | 'rate_limited' | 'unreachable' | 'bad_response';

export class FireflyError extends Error {
  constructor(
    readonly status: number,
    readonly code: FireflyErrorCode,
  ) {
    super(`Firefly: ${code}${status ? ` (HTTP ${status})` : ''}`);
  }
}

export type FfBill = {
  id: string; name: string; amountMin: string; amountMax: string; currencyCode: string; date: string;
  repeatFreq: 'weekly' | 'monthly' | 'quarterly' | 'half-year' | 'yearly'; skip: number; active: boolean; notes: string | null;
  updatedAt: string; nextExpectedMatch: string | null;
};
export type FfJournal = {
  groupId: string; journalId: string; date: string; amount: string; currencyCode: string;
  foreignAmount: string | null; foreignCurrencyCode: string | null; billId: string | null;
};
export type FfBillWrite = {
  name: string; amount_min: string; amount_max: string; currency_code: string; date: string;
  repeat_freq: FfBill['repeatFreq']; skip: number; active: boolean; notes: string | null;
};
export type FfWithdrawal = {
  date: string; amount: string; currency_code: string; foreign_amount?: string; foreign_currency_code?: string;
  description: string; source_id: string; destination_name: string; bill_id: string; category_name?: string;
};

type Resource = { id: string; type?: string; attributes: Record<string, unknown> };
type Doc = { data: Resource | Resource[]; meta?: { pagination?: { current_page?: number; total_pages?: number } } };

const str = (v: unknown): string | null => (v === null || v === undefined || v === '' ? null : String(v));

function toBill(r: Resource): FfBill {
  const a = r.attributes;
  return {
    id: String(r.id), name: String(a.name), amountMin: String(a.amount_min), amountMax: String(a.amount_max),
    currencyCode: String(a.currency_code), date: String(a.date), repeatFreq: a.repeat_freq as FfBill['repeatFreq'],
    skip: Number(a.skip ?? 0), active: Boolean(a.active), notes: str(a.notes), updatedAt: String(a.updated_at),
    nextExpectedMatch: str(a.next_expected_match),
  };
}

function toJournals(r: Resource): FfJournal[] {
  const splits = (r.attributes.transactions ?? []) as Record<string, unknown>[];
  return splits.map((t) => ({
    groupId: String(r.id), journalId: String(t.transaction_journal_id), date: String(t.date), amount: String(t.amount),
    currencyCode: String(t.currency_code), foreignAmount: str(t.foreign_amount), foreignCurrencyCode: str(t.foreign_currency_code),
    billId: str(t.bill_id),
  }));
}

async function call(ctx: ServiceCtx, c: FireflyConn, method: string, path: string, body?: unknown): Promise<Doc> {
  const headers: Record<string, string> = { Authorization: `Bearer ${c.token}`, Accept: 'application/vnd.api+json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    // The Firefly API never redirects; refusing to follow keeps the token off any other host.
    res = await guardedFetch(ctx, `${c.baseUrl}/api/v1${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), redirect: 'manual' });
  } catch {
    throw new FireflyError(0, 'unreachable'); // network failure or BlockedAddressError
  }
  if (res.status >= 300 && res.status < 400) throw new FireflyError(res.status, 'bad_response');
  if (res.status === 401 || res.status === 403) throw new FireflyError(res.status, 'unauthorized');
  if (res.status === 404) throw new FireflyError(404, 'not_found');
  if (res.status === 429) throw new FireflyError(429, 'rate_limited');
  let doc: Doc;
  try {
    doc = JSON.parse(await res.text()) as Doc;
  } catch {
    throw new FireflyError(res.status, 'bad_response');
  }
  if (!res.ok || !doc || typeof doc !== 'object' || !('data' in doc)) throw new FireflyError(res.status, 'bad_response');
  return doc;
}

const one = (doc: Doc): Resource => (Array.isArray(doc.data) ? doc.data[0]! : doc.data);

/** Every item of a paged list endpoint, following `meta.pagination.total_pages`. */
async function all(ctx: ServiceCtx, c: FireflyConn, path: string): Promise<Resource[]> {
  const out: Resource[] = [];
  for (let page = 1, total = 1; page <= total; page++) {
    const doc = await call(ctx, c, 'GET', `${path}${path.includes('?') ? '&' : '?'}page=${page}`);
    out.push(...(Array.isArray(doc.data) ? doc.data : [doc.data]));
    total = doc.meta?.pagination?.total_pages ?? 1;
  }
  return out;
}

export async function about(ctx: ServiceCtx, c: FireflyConn): Promise<{ version: string }> {
  const doc = (await call(ctx, c, 'GET', '/about')) as unknown as { data: { version?: unknown } };
  return { version: String(doc.data.version ?? '') };
}

export async function listAssetAccounts(ctx: ServiceCtx, c: FireflyConn): Promise<{ id: string; name: string; currencyCode: string }[]> {
  return (await all(ctx, c, '/accounts?type=asset')).map((r) => ({ id: String(r.id), name: String(r.attributes.name), currencyCode: String(r.attributes.currency_code) }));
}

export async function listBills(ctx: ServiceCtx, c: FireflyConn): Promise<FfBill[]> {
  return (await all(ctx, c, '/bills')).map(toBill);
}

export async function getBill(ctx: ServiceCtx, c: FireflyConn, id: string): Promise<FfBill | null> {
  try {
    return toBill(one(await call(ctx, c, 'GET', `/bills/${encodeURIComponent(id)}`)));
  } catch (err) {
    if (err instanceof FireflyError && err.code === 'not_found') return null;
    throw err;
  }
}

export async function createBill(ctx: ServiceCtx, c: FireflyConn, body: FfBillWrite): Promise<FfBill> {
  return toBill(one(await call(ctx, c, 'POST', '/bills', body)));
}

export async function updateBill(ctx: ServiceCtx, c: FireflyConn, id: string, body: Partial<FfBillWrite>): Promise<FfBill> {
  return toBill(one(await call(ctx, c, 'PUT', `/bills/${encodeURIComponent(id)}`, body)));
}

export async function billJournals(ctx: ServiceCtx, c: FireflyConn, billId: string, start: string, end: string): Promise<FfJournal[]> {
  const q = new URLSearchParams({ start, end });
  return (await all(ctx, c, `/bills/${encodeURIComponent(billId)}/transactions?${q}`)).flatMap(toJournals);
}

export async function createWithdrawal(ctx: ServiceCtx, c: FireflyConn, t: FfWithdrawal): Promise<FfJournal> {
  const journals = toJournals(one(await call(ctx, c, 'POST', '/transactions', { transactions: [{ type: 'withdrawal', ...t }] })));
  if (!journals[0]) throw new FireflyError(200, 'bad_response');
  return journals[0];
}
