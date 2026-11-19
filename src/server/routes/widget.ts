import { Router } from 'express';
import { principal, requireBearer } from '../auth/middleware.js';
import type { ServiceCtx } from '../services/context.js';
import { getSummary } from '../services/subscriptions.js';
import { handle } from './subscriptions.js';

const WIDGET_ITEMS = 6;

export function widgetRouter(ctx: ServiceCtx): Router {
  const router = Router();
  router.get('/', requireBearer(ctx, ['read']), handle((req, res) => {
    const now = ctx.now();
    const s = getSummary(ctx, principal(req).userId, now);
    res.json({
      base: s.base,
      leftThisMonthMinor: s.leftThisMonthMinor,
      monthlyAverageMinor: s.monthlyAverageMinor,
      ratesStale: s.ratesStale,
      items: [...s.overdue, ...s.upcoming].slice(0, WIDGET_ITEMS),
      generatedAt: now.toISOString(),
    });
  }));
  return router;
}
