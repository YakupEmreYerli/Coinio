import { inArray } from 'drizzle-orm';
import type { FamilyScope } from '../../shared/types.js';
import { payments } from '../db/schema.js';
import { computeReport, type Report } from '../domain/report.js';
import { todayIn } from '../../shared/schedule.js';
import type { ServiceCtx } from './context.js';
import { getHouseholdContext } from './family.js';
import { getRates } from './fx.js';
import { getSettings } from './settings.js';
import { buildAmountOverrides, buildMemberBreakdown, listSubscriptions } from './subscriptions.js';

export type { Report };

export function getReport(
  ctx: ServiceCtx,
  userId: number,
  now: Date,
  opts: { scope?: FamilyScope; memberId?: number } = {},
): Report {
  const settings = getSettings(ctx, userId);
  const today = todayIn(settings.timezone, now);
  const hh = getHouseholdContext(ctx.db, userId);
  const subs = listSubscriptions(ctx, userId, { includeInactive: true, scope: opts.scope, memberId: opts.memberId });
  const ids = subs.map((s) => s.id);
  const pays = ids.length ? ctx.db.select().from(payments).where(inArray(payments.subscriptionId, ids)).all() : [];
  const amountOverrides = buildAmountOverrides(subs, hh, opts);
  const memberBreakdown = buildMemberBreakdown(subs, hh);
  return computeReport({
    subs,
    payments: pays,
    today,
    rates: getRates(ctx.db, settings.baseCurrency, today),
    amountOverrides,
    memberBreakdown,
  });
}
