import { eq } from 'drizzle-orm';
import { decimalToMinor } from '../../shared/money.js';
import { payments, subscriptions } from '../db/schema.js';
import type { ServiceCtx } from './context.js';
import { LimitError } from './errors.js';
import { fetchLogoInBackground } from './logos.js';
import { insertSubscription, updateSubscription } from './subscriptions.js';

// Reads Coinio's own exports back: the subscriptions and payments files from Settings › Export (JSON or CSV)
// and the single "download my data" file of a hosted instance ({ subscriptions, payments, ... }).

export class UnknownFileError extends Error {
  constructor(readonly file: string) {
    super(`Not a Coinio export: ${file}`);
  }
}

export type ImportFile = { name: string; text: string };

type Sub = {
  oldId: number | null;
  name: string;
  domain: string | null;
  amountMinor: number;
  currency: string;
  variableAmount: boolean;
  cycle: string;
  intervalCount: number;
  nextDue: string;
  autoPay: boolean;
  paymentMethod: string | null;
  category: string | null;
  notes: string | null;
  reminderOffsets: number[] | null;
  trialEndsAt: string | null;
  active: boolean;
};
type Pay = {
  oldSubscriptionId: number;
  dueDate: string;
  paidAt: string;
  amountMinor: number;
  currency: string;
  actualBaseMinor: number | null;
  source: 'manual' | 'auto';
  status: 'paid' | 'void' | 'skipped';
};

/** RFC 4180 CSV: quoted fields may hold commas, doubled quotes and line breaks. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  row.push(cell);
  if (row.some((v) => v !== '')) rows.push(row);
  return rows;
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() && Number.isFinite(Number(v)) ? Number(v) : null);
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : fallback);
const offsets = (v: unknown): number[] | null => {
  const list = Array.isArray(v) ? v : typeof v === 'string' && v.trim() ? v.split(';') : null;
  const out = list?.map(Number).filter((n) => Number.isInteger(n) && n >= 0);
  return out && out.length ? out : null;
};

function subFrom(o: Record<string, unknown>): Sub | null {
  const name = str(o.name);
  const currency = str(o.currency);
  const amountMinor = num(o.amountMinor);
  const cycle = str(o.cycle);
  const nextDue = str(o.nextDue);
  if (!name || !currency || amountMinor === null || !cycle || !nextDue) return null;
  return {
    oldId: num(o.id),
    name,
    domain: str(o.domain),
    amountMinor,
    currency,
    variableAmount: bool(o.variableAmount, false),
    cycle,
    intervalCount: num(o.intervalCount) ?? 1,
    nextDue,
    autoPay: bool(o.autoPay, true),
    paymentMethod: str(o.paymentMethod),
    category: str(o.category),
    notes: str(o.notes),
    reminderOffsets: offsets(o.reminderOffsets),
    trialEndsAt: str(o.trialEndsAt),
    active: bool(o.active, true),
  };
}

function payFrom(o: Record<string, unknown>): Pay | null {
  const oldSubscriptionId = num(o.subscriptionId);
  const dueDate = str(o.dueDate);
  const amountMinor = num(o.amountMinor);
  const currency = str(o.currency);
  if (oldSubscriptionId === null || !dueDate || amountMinor === null || !currency) return null;
  const status = o.status === 'void' || o.status === 'skipped' ? o.status : 'paid';
  return {
    oldSubscriptionId,
    dueDate,
    paidAt: str(o.paidAt) ?? dueDate,
    amountMinor,
    currency,
    actualBaseMinor: num(o.actualBaseMinor),
    source: o.source === 'auto' ? 'auto' : 'manual',
    status,
  };
}

const isSubLike = (o: unknown) => !!o && typeof o === 'object' && 'cycle' in o && 'nextDue' in o;
const isPayLike = (o: unknown) => !!o && typeof o === 'object' && 'subscriptionId' in o && 'dueDate' in o;

/** CSV rows as objects with the JSON field names; decimal amounts become minor units in each row's currency. */
function csvObjects(rows: string[][]): Record<string, unknown>[] {
  const [head, ...body] = rows;
  const camel = (h: string) => h.replace(/_(\w)/g, (_, c: string) => c.toUpperCase());
  return body.map((r) => {
    const o: Record<string, unknown> = {};
    head!.forEach((h, i) => (o[camel(h)] = r[i] ?? ''));
    const toMinor = (v: unknown) => (typeof v === 'string' && v.trim() ? decimalToMinor(Number(v), String(o.currency)) : null);
    if ('amount' in o) o.amountMinor = toMinor(o.amount);
    if ('actualBaseAmount' in o) o.actualBaseMinor = null; // base currency of the source is unknown here
    return o;
  });
}

export function parseCoinioFiles(files: ImportFile[]): { subs: Sub[]; pays: Pay[] } {
  const subs: Sub[] = [];
  const pays: Pay[] = [];
  for (const f of files) {
    const text = f.text.replace(/^﻿/, '').trim();
    let objects: unknown[];
    if (text.startsWith('{') || text.startsWith('[')) {
      let data: unknown;
      try {
        data = JSON.parse(text);
      } catch {
        throw new UnknownFileError(f.name);
      }
      if (Array.isArray(data)) objects = data;
      else if (data && typeof data === 'object' && Array.isArray((data as { subscriptions?: unknown }).subscriptions)) {
        const full = data as { subscriptions: unknown[]; payments?: unknown[] };
        objects = [...full.subscriptions, ...(Array.isArray(full.payments) ? full.payments : [])];
      } else throw new UnknownFileError(f.name);
    } else {
      const rows = parseCsv(text);
      const head = rows[0] ?? [];
      if (!(head.includes('next_due') || head.includes('subscription_id'))) throw new UnknownFileError(f.name);
      objects = csvObjects(rows);
    }
    let used = 0;
    for (const o of objects) {
      if (isSubLike(o)) {
        const s = subFrom(o as Record<string, unknown>);
        if (s) (subs.push(s), used++);
      } else if (isPayLike(o)) {
        const p = payFrom(o as Record<string, unknown>);
        if (p) (pays.push(p), used++);
      }
    }
    if (objects.length > 0 && used === 0) throw new UnknownFileError(f.name);
  }
  return { subs, pays };
}

const key = (s: { name: string; currency: string; cycle: string; intervalCount: number }) => `${s.name.trim().toLowerCase()}|${s.currency}|${s.cycle}|${s.intervalCount}`;

export function importCoinio(
  ctx: ServiceCtx,
  userId: number,
  files: ImportFile[],
  dryRun: boolean,
): { created: number; payments: number; items: { name: string }[]; warnings: string[] } {
  const { subs, pays } = parseCoinioFiles(files);
  const warnings: string[] = [];
  const existing = new Set(ctx.db.select().from(subscriptions).where(eq(subscriptions.userId, userId)).all().map(key));
  const fresh = subs.filter((s) => {
    if (!existing.has(key(s))) return true;
    warnings.push(`"${s.name}": already exists, skipped`);
    return false;
  });
  if (pays.length && !subs.length) warnings.push('Payments need the subscriptions file too: choose both files together.');
  const freshIds = new Set(fresh.map((s) => s.oldId));
  const usable = pays.filter((p) => freshIds.has(p.oldSubscriptionId));
  const items = fresh.map((s) => ({ name: s.name }));
  if (dryRun) return { created: 0, payments: usable.length, items, warnings };

  let created = 0;
  let paid = 0;
  const logos: { id: number; domain: string }[] = [];
  ctx.db.transaction((tx) => {
    const txCtx = { ...ctx, db: tx as typeof ctx.db };
    const ids = new Map<number, number>();
    for (const s of fresh) {
      let row;
      try {
        row = insertSubscription(txCtx, userId, s);
      } catch (err) {
        if (!(err instanceof LimitError)) throw err;
        warnings.push('limit_reached');
        break;
      }
      if (!s.active) updateSubscription(txCtx, userId, row.id, { active: false });
      if (s.oldId !== null) ids.set(s.oldId, row.id);
      if (row.domain) logos.push({ id: row.id, domain: row.domain });
      created++;
    }
    for (const p of usable) {
      const subscriptionId = ids.get(p.oldSubscriptionId);
      if (!subscriptionId) continue;
      const { oldSubscriptionId: _, ...values } = p;
      const res = tx.insert(payments).values({ ...values, subscriptionId }).onConflictDoNothing().run();
      paid += res.changes;
    }
  });
  for (const l of logos) fetchLogoInBackground(ctx, l.id, l.domain);
  return { created, payments: paid, items, warnings };
}
