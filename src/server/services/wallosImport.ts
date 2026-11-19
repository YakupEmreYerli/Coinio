import { z } from 'zod';
import { SubscriptionInput } from '../../shared/types.js';
import { todayIn } from '../../shared/schedule.js';
import type { ServiceCtx } from './context.js';
import { fetchLogoInBackground } from './logos.js';
import { getSettings } from './settings.js';
import { insertSubscription, updateSubscription } from './subscriptions.js';

/** A parsed Wallos row: the regular input plus the `active` flag, which creation does not take. */
export type WallosItem = SubscriptionInput & { active: boolean };
export type WallosParseResult = { items: WallosItem[]; warnings: string[] };

/** Keys written by Wallos' endpoints/subscriptions/export.php. Only some are used; the rest are known and ignored. */
const KNOWN_KEYS = new Set([
  'Name', 'Payment Cycle', 'Next Payment', 'Renewal', 'Category', 'Payment Method', 'Paid By', 'Price', 'Notes', 'URL',
  'State', 'Notifications', 'Cancellation Date', 'Active',
]);

const ExportShape = z.union([
  z.array(z.unknown()),
  z.object({ subscriptions: z.array(z.unknown()) }).transform((o) => o.subscriptions),
]);

const SYMBOL_CURRENCY: Record<string, string> = { '₺': 'TRY', '€': 'EUR', '£': 'GBP', '$': 'USD' };
const HOSTNAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const orNull = (v: unknown): string | null => text(v) || null;

type Cycle = { cycle: SubscriptionInput['cycle']; intervalCount: number };

function parseCycle(raw: string): Cycle | { error: string } {
  const plain = /^(daily|weekly|monthly|yearly)$/i.exec(raw);
  if (plain) {
    const unit = plain[1]!.toLowerCase();
    if (unit === 'daily') return { error: 'Daily cycle is not supported' };
    return { cycle: unit as Cycle['cycle'], intervalCount: 1 };
  }
  const every = /^every (\d+) (days|weeks|months|years)$/i.exec(raw);
  if (!every) return { error: `unrecognized payment cycle "${raw}"` };
  const n = Number(every[1]);
  const unit = every[2]!.toLowerCase();
  if (unit === 'weeks') return { cycle: 'weekly', intervalCount: n };
  if (unit === 'months') return { cycle: 'monthly', intervalCount: n };
  if (unit === 'years') return { cycle: 'yearly', intervalCount: n };
  if (n % 7 === 0) return { cycle: 'weekly', intervalCount: n / 7 };
  return { error: `${n}-day cycle is not supported` };
}

type Price = { amountMinor: number; currency: string; notes: string[] };

/**
 * Wallos writes the currency symbol directly before a PHP float ("₺999.99"), but hand-edited files may use a
 * locale decimal comma ("999,99 ₺", "1.234,56"). A lone separator followed by exactly three digits is ambiguous.
 */
function parsePrice(raw: unknown): Price | { error: string } {
  let s = text(raw);
  const notes: string[] = [];
  let currency: string | undefined;
  const code = /\b([A-Z]{3})\b/.exec(s);
  if (code) {
    currency = code[1];
    s = s.replace(code[0], '');
  }
  const symbol = [...s].find((ch) => ch in SYMBOL_CURRENCY);
  if (symbol) {
    currency ??= SYMBOL_CURRENCY[symbol];
    if (symbol === '$') notes.push('"$" is ambiguous (USD, CAD, AUD, ...); imported as USD');
    s = s.replace(symbol, '');
  }
  s = s.replace(/\s/g, '');
  if (!/^[\d.,]*\d[\d.,]*$/.test(s)) return { error: `unrecognized currency or price "${text(raw)}"` };
  if (!currency) return { error: `no currency in price "${text(raw)}"` };

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');
  let intPart: string;
  let frac = '';
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = Math.max(lastDot, lastComma);
    intPart = s.slice(0, dec).replace(/[.,]/g, '');
    frac = s.slice(dec + 1);
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ',';
    const parts = s.split(sep);
    const tail = parts[parts.length - 1]!;
    if (parts.length > 2) {
      intPart = parts.join('');
    } else if (tail.length === 3 && parts[0] !== '0' && parts[0]!.length <= 3) {
      intPart = parts.join('');
      notes.push(`price "${text(raw)}" is ambiguous; "${sep}" read as a thousands separator`);
    } else {
      intPart = parts[0]!;
      frac = tail;
    }
  } else {
    intPart = s;
  }
  if (frac.length > 2) return { error: `price "${text(raw)}" has more than 2 decimals` };
  if (intPart === '' || /\D/.test(intPart + frac)) return { error: `unrecognized price "${text(raw)}"` };
  const amountMinor = Number(intPart) * 100 + Number(frac.padEnd(2, '0'));
  if (!Number.isSafeInteger(amountMinor)) return { error: `price "${text(raw)}" is too large` };
  return { amountMinor, currency: currency!, notes };
}

function toHostname(raw: unknown): string | null {
  const url = text(raw);
  if (!url) return null;
  try {
    const host = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase();
    return HOSTNAME.test(host) ? host : null;
  } catch {
    return null;
  }
}

export function parseWallosExport(json: unknown): WallosParseResult {
  const rows = ExportShape.parse(json);
  const items: WallosItem[] = [];
  const warnings: string[] = [];
  const unknownKeys = new Set<string>();

  rows.forEach((entry, index) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      warnings.push(`Row ${index + 1}: not an object, skipped`);
      return;
    }
    const r = entry as Record<string, unknown>;
    for (const key of Object.keys(r)) if (!KNOWN_KEYS.has(key)) unknownKeys.add(key);
    const label = `Row ${index + 1} "${text(r.Name)}"`;
    const skip = (why: string) => warnings.push(`${label}: ${why}, skipped`);

    const cycle = parseCycle(text(r['Payment Cycle']));
    if ('error' in cycle) return skip(cycle.error);
    const price = parsePrice(r.Price);
    if ('error' in price) return skip(price.error);
    warnings.push(...price.notes.map((n) => `${label}: ${n}`));

    const renewal = text(r.Renewal).toLowerCase();
    if (renewal !== 'automatic' && renewal !== 'manual') warnings.push(`${label}: unknown renewal "${text(r.Renewal)}", imported as manual`);
    const category = orNull(r.Category);

    const parsed = SubscriptionInput.safeParse({
      name: text(r.Name),
      amountMinor: price.amountMinor,
      currency: price.currency,
      ...cycle,
      nextDue: text(r['Next Payment']),
      domain: toHostname(r.URL),
      paymentMethod: orNull(r['Payment Method']),
      category: category === 'No Category' ? null : category,
      notes: orNull(r.Notes),
      autoPay: renewal === 'automatic',
    });
    if (!parsed.success) return skip(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    items.push({ ...parsed.data, active: text(r.Active).toLowerCase() !== 'no' });
  });

  for (const key of unknownKeys) warnings.push(`Unrecognized field "${key}" ignored`);
  return { items, warnings };
}

/** Runs all inserts in one transaction (all or nothing); invalid rows were already turned into warnings. */
export function importWallos(
  ctx: ServiceCtx,
  userId: number,
  data: unknown,
  dryRun: boolean,
): { created: number; items: WallosItem[]; warnings: string[] } {
  const { items, warnings } = parseWallosExport(data);
  const today = todayIn(getSettings(ctx).timezone, ctx.now());
  for (const item of items) {
    if (item.active && !item.autoPay && item.nextDue < today) {
      warnings.push(`"${item.name}": manual subscription whose next payment (${item.nextDue}) is in the past; it will show as overdue`);
    }
  }
  if (dryRun) return { created: 0, items, warnings };

  const rows = ctx.db.transaction((tx) => {
    const txCtx = { ...ctx, db: tx as typeof ctx.db };
    return items.map((item) => {
      const row = insertSubscription(txCtx, userId, item);
      return item.active ? row : updateSubscription(txCtx, userId, row.id, { active: false });
    });
  });
  // Logo fetches run after commit: they outlive the transaction handle.
  for (const row of rows) if (row.domain) fetchLogoInBackground(ctx, row.id, row.domain);
  return { created: rows.length, items, warnings };
}
