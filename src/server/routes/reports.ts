import { Router } from 'express';
import { requireSession } from '../auth/middleware.js';
import type { ServiceCtx } from '../services/context.js';
import { getReport } from '../services/reports.js';
import { handle } from './subscriptions.js';

export function reportsRouter(ctx: ServiceCtx): Router {
  const router = Router();
  router.get('/', requireSession(ctx.db, ctx.now), handle((req, res) => {
    res.json(getReport(ctx, req.userId!, ctx.now()));
  }));
  return router;
}
