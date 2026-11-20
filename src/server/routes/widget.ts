import { Router } from 'express';
import { widgetPayload } from '../../shared/widget.js';
import { principal, requireBearer } from '../auth/middleware.js';
import type { ServiceCtx } from '../services/context.js';
import { getSummary } from '../services/subscriptions.js';
import { handle } from './subscriptions.js';

export function widgetRouter(ctx: ServiceCtx): Router {
  const router = Router();
  router.get('/', requireBearer(ctx, ['read']), handle((req, res) => {
    const now = ctx.now();
    res.json(widgetPayload(getSummary(ctx, principal(req).userId, now), now));
  }));
  return router;
}
