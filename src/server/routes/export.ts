import { Router } from 'express';
import { ExportQuery } from '../../shared/types.js';
import { minorToDecimal } from '../../shared/money.js';
import { requireSession } from '../auth/middleware.js';
import { todayIn } from '../../shared/schedule.js';
import type { ServiceCtx } from '../services/context.js';
import { getSettings } from '../services/settings.js';
import { listPayments, listSubscriptions } from '../services/subscriptions.js';
import { handle, paymentToApi, subscriptionToApi } from './subscriptions.js';

type Cell = string | number | boolean | null;

/** Minor units as a plain decimal in the currency's exponent ("1234.56", "1500" for JPY). */
const decimal = (minor: number | null, currency: string): string => (minor === null ? '' : minorToDecimal(minor, currency));

/** RFC 4180: quote fields holding a comma, quote or line break; double inner quotes; CRLF rows. */
function toCsv(header: string[], rows: Cell[][]): string {
  const cell = (v: Cell) => {
    let s = v === null ? '' : String(v);
    // Neutralize spreadsheet formulas (=, +, -, @, tab, CR) before RFC 4180 quoting.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\r\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function exportRouter(ctx: ServiceCtx): Router {
  const router = Router();
  router.get('/', requireSession(ctx.db, ctx.now), handle((req, res) => {
    const { format, what } = ExportQuery.parse(req.query);
    const userId = req.userId!;
    const subs = listSubscriptions(ctx, userId, { includeInactive: true });
    const pays = what === 'payments' ? listPayments(ctx, userId) : [];
    const { timezone, baseCurrency } = getSettings(ctx, userId);
    const date = todayIn(timezone, ctx.now());
    res.setHeader('Content-Disposition', `attachment; filename="coinio-${what}-${date}.${format}"`);

    if (format === 'json') {
      res.type('application/json').send(
        JSON.stringify(what === 'subscriptions' ? subs.map(subscriptionToApi) : pays.map(paymentToApi), null, 2),
      );
      return;
    }

    if (what === 'subscriptions') {
      res.type('text/csv').send(toCsv(
        ['id', 'name', 'domain', 'amount', 'currency', 'variable_amount', 'cycle', 'interval_count', 'next_due', 'auto_pay',
          'payment_method', 'category', 'notes', 'reminder_offsets', 'trial_ends_at', 'active', 'created_at'],
        subs.map((s) => [s.id, s.name, s.domain, decimal(s.amountMinor, s.currency), s.currency, s.variableAmount, s.cycle,
          s.intervalCount, s.nextDue, s.autoPay, s.paymentMethod, s.category, s.notes, s.reminderOffsets?.join(';') ?? '', s.trialEndsAt ?? '', s.active, s.createdAt]),
      ));
      return;
    }

    const names = new Map(subs.map((s) => [s.id, s.name]));
    res.type('text/csv').send(toCsv(
      ['id', 'subscription_id', 'subscription_name', 'due_date', 'paid_at', 'amount', 'currency', 'actual_base_amount',
        'source', 'status'],
      pays.map((p) => [p.id, p.subscriptionId, names.get(p.subscriptionId) ?? null, p.dueDate, p.paidAt,
        decimal(p.amountMinor, p.currency), p.currency, decimal(p.actualBaseMinor, baseCurrency), p.source, p.status]),
    ));
  }));
  return router;
}
