import { inArray } from 'drizzle-orm';
import { payments } from '../db/schema.js';
import { computeReport, type Report } from '../domain/report.js';
import { todayIn } from '../../shared/schedule.js';
import type { ServiceCtx } from './context.js';
import { getRates } from './fx.js';
import { getSettings } from './settings.js';
import { listSubscriptions } from './subscriptions.js';

export type { Report };

export function getReport(ctx: ServiceCtx, userId: number, now: Date): Report {
  const settings = getSettings(ctx);
  const today = todayIn(settings.timezone, now);
  const subs = listSubscriptions(ctx, userId, { includeInactive: true });
  const ids = subs.map((s) => s.id);
  const pays = ids.length ? ctx.db.select().from(payments).where(inArray(payments.subscriptionId, ids)).all() : [];
  return computeReport({ subs, payments: pays, today, rates: getRates(ctx.db, settings.baseCurrency, today) });
}
