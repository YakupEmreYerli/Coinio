import { Router, type RequestHandler } from 'express';
import { z, ZodError } from 'zod';
import { requireSession } from '../auth/middleware.js';
import { NotFoundError } from '../services/errors.js';
import type { ServiceCtx } from '../services/context.js';
import { channelToApi, createChannel, deleteChannel, draftChannel, getChannel, listChannels, updateChannel } from '../services/notify/channels.js';
import { sendChannelTest, sendTemplateTest } from '../services/notify/index.js';
import { listLog } from '../services/notify/queue.js';
import { getNotifySettings, getTemplateOverrides, resetTemplate, saveNotifySettings, saveTemplate } from '../services/notify/store.js';
import { getSettings } from '../services/settings.js';
import { defaultTemplates } from '../../shared/notify/defaults.js';
import { NOTIFY_TYPES, TemplateText } from '../../shared/notify/types.js';
import { toLocale } from '../i18n/index.js';

const idParam = z.coerce.number().int().positive();
const typeParam = z.enum(NOTIFY_TYPES);

/** Like `handle`, for async bodies: validation → 400, missing → 404. */
function route(fn: (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) => unknown): RequestHandler {
  return async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof ZodError) res.status(400).json({ error: 'validation', issues: err.issues });
      else if (err instanceof NotFoundError) res.status(404).json({ error: 'not_found' });
      else next(err);
    }
  };
}

/** A failed test answers 502 with the service's own words, for the UI to show as is. */
const testResult = (res: Parameters<RequestHandler>[1], error: string | null) =>
  error === null ? res.json({ ok: true }) : res.status(502).json({ error: 'delivery_failed', message: error });

export function notificationsRouter(ctx: ServiceCtx): Router {
  const router = Router();
  router.use(requireSession(ctx.db, ctx.now));

  /** Everything the settings page shows, in one call. Secrets never leave the server. */
  router.get('/', route((req, res) => {
    const overrides = getTemplateOverrides(ctx, req.userId!);
    const defaults = defaultTemplates(toLocale(getSettings(ctx, req.userId!).locale));
    res.json({
      settings: getNotifySettings(ctx, req.userId!),
      channels: listChannels(ctx, req.userId!).map(channelToApi),
      templates: Object.fromEntries(NOTIFY_TYPES.map((t) => [t, { ...(overrides[t] ?? defaults[t]), custom: t in overrides }])),
      defaults,
      appUrl: ctx.config.publicUrl,
    });
  }));

  router.put('/settings', route((req, res) => {
    res.json(saveNotifySettings(ctx, req.userId!, req.body));
  }));

  router.post('/channels', route((req, res) => {
    res.status(201).json(channelToApi(createChannel(ctx, req.userId!, req.body)));
  }));
  router.post('/channels/test', route(async (req, res) => {
    const body = z.object({ id: idParam.optional() }).passthrough().parse(req.body ?? {});
    testResult(res, await sendChannelTest(ctx, req.userId!, draftChannel(ctx, req.userId!, req.body, body.id)));
  }));
  router.patch('/channels/:id', route((req, res) => {
    res.json(channelToApi(updateChannel(ctx, req.userId!, idParam.parse(req.params.id), req.body)));
  }));
  router.delete('/channels/:id', route((req, res) => {
    deleteChannel(ctx, req.userId!, idParam.parse(req.params.id));
    res.status(204).end();
  }));
  router.post('/channels/:id/test', route(async (req, res) => {
    testResult(res, await sendChannelTest(ctx, req.userId!, getChannel(ctx, req.userId!, idParam.parse(req.params.id))));
  }));

  router.put('/templates/:type', route((req, res) => {
    res.json(saveTemplate(ctx, req.userId!, typeParam.parse(req.params.type), req.body));
  }));
  router.delete('/templates/:type', route((req, res) => {
    resetTemplate(ctx, req.userId!, typeParam.parse(req.params.type));
    res.status(204).end();
  }));
  router.post('/templates/:type/test', route(async (req, res) => {
    const type = typeParam.parse(req.params.type);
    const body = z.object({ channelId: idParam, title: z.string(), body: z.string() }).parse(req.body);
    const tpl = TemplateText.parse({ title: body.title, body: body.body });
    testResult(res, await sendTemplateTest(ctx, req.userId!, getChannel(ctx, req.userId!, body.channelId), type, tpl));
  }));

  router.get('/log', route((req, res) => {
    res.json(listLog(ctx, req.userId!, z.coerce.number().int().min(1).max(100).default(20).parse(req.query.limit)));
  }));

  return router;
}
