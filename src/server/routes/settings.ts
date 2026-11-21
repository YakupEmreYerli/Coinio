import { Router } from 'express';
import { requireSession } from '../auth/middleware.js';
import type { ServiceCtx } from '../services/context.js';
import { getAppearance, setAppearance } from '../services/appearance.js';
import { getSettings, updateSettings } from '../services/settings.js';
import { handle } from './subscriptions.js';

export function settingsRouter(ctx: ServiceCtx): Router {
  const router = Router();
  router.use(requireSession(ctx.db, ctx.now));
  router.get('/', handle((req, res) => {
    res.json(getSettings(ctx, req.userId!));
  }));
  router.patch('/', handle((req, res) => {
    res.json(updateSettings(ctx, req.userId!, req.body));
  }));
  return router;
}

export function appearanceRouter(ctx: ServiceCtx): Router {
  const router = Router();
  router.use(requireSession(ctx.db, ctx.now));
  router.get('/', handle((req, res) => {
    res.json(getAppearance(ctx, req.userId!));
  }));
  router.put('/', handle((req, res) => {
    res.json(setAppearance(ctx, req.userId!, req.body));
  }));
  return router;
}
