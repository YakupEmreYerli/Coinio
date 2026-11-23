import { Router } from 'express';
import { ScopeQuery } from '../../shared/types.js';
import { requireSession } from '../auth/middleware.js';
import type { ServiceCtx } from '../services/context.js';
import { getReport } from '../services/reports.js';
import { handle } from './subscriptions.js';

export function reportsRouter(ctx: ServiceCtx): Router {
  const router = Router();
  router.get('/', requireSession(ctx.db, ctx.now), handle((req, res) => {
    const q = ScopeQuery.parse(req.query);
    res.json(getReport(ctx, req.userId!, ctx.now(), { scope: q.scope, memberId: q.memberId }));
  }));
  return router;
}
