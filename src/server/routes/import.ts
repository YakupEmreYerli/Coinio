import { Router } from 'express';
import { z } from 'zod';
import { requireSession } from '../auth/middleware.js';
import type { ServiceCtx } from '../services/context.js';
import { importWallos } from '../services/wallosImport.js';
import { handle } from './subscriptions.js';

const Body = z.object({ data: z.unknown(), dryRun: z.boolean() });

export function importRouter(ctx: ServiceCtx): Router {
  const router = Router();
  router.use(requireSession(ctx.db, ctx.now));
  router.post('/wallos', handle((req, res) => {
    const { data, dryRun } = Body.parse(req.body);
    res.json(importWallos(ctx, req.userId!, data, dryRun));
  }));
  return router;
}
