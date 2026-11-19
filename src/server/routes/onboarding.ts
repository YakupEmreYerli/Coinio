import { Router } from 'express';
import { requireSession } from '../auth/middleware.js';
import type { ServiceCtx } from '../services/context.js';
import { clearSamples, completeOnboarding, createSamples, getOnboarding } from '../services/onboarding.js';
import { handle } from './subscriptions.js';

export function onboardingRouter(ctx: ServiceCtx): Router {
  const router = Router();
  router.use(requireSession(ctx.db, ctx.now));
  router.get('/', handle((req, res) => {
    res.json(getOnboarding(ctx, req.userId!));
  }));
  router.post('/complete', handle((_req, res) => {
    completeOnboarding(ctx);
    res.status(204).end();
  }));
  router.post('/samples', handle((req, res) => {
    res.status(201).json({ ids: createSamples(ctx, req.userId!) });
  }));
  router.delete('/samples', handle((req, res) => {
    clearSamples(ctx, req.userId!);
    res.status(204).end();
  }));
  return router;
}
