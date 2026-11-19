import { Router } from 'express';
import { requireSession } from '../auth/middleware.js';
import type { ServiceCtx } from '../services/context.js';
import { getAppearance, setAppearance } from '../services/appearance.js';
import { getSettings, updateSettings } from '../services/settings.js';
import { sendTestMessage } from '../services/telegram.js';
import type { Settings } from '../../shared/types.js';
import { handle } from './subscriptions.js';

function mask(s: Settings): Settings {
  const t = s.telegramBotToken;
  return { ...s, telegramBotToken: t ? (t.length > 8 ? `****${t.slice(-4)}` : '****') : null };
}

export function settingsRouter(ctx: ServiceCtx): Router {
  const router = Router();
  router.use(requireSession(ctx.db, ctx.now));
  router.get('/', handle((_req, res) => {
    res.json(mask(getSettings(ctx)));
  }));
  router.patch('/', handle((req, res) => {
    res.json(mask(updateSettings(ctx, req.body)));
  }));
  router.post('/telegram/test', async (_req, res) => {
    const result = await sendTestMessage(ctx);
    if (result === 'not_configured') res.status(400).json({ error: 'not_configured' });
    else if (result === 'failed') res.status(502).json({ error: 'telegram_error' });
    else res.json({ ok: true });
  });
  return router;
}

export function appearanceRouter(ctx: ServiceCtx): Router {
  const router = Router();
  router.use(requireSession(ctx.db, ctx.now));
  router.get('/', handle((_req, res) => {
    res.json(getAppearance(ctx));
  }));
  router.put('/', handle((req, res) => {
    res.json(setAppearance(ctx, req.body));
  }));
  return router;
}
