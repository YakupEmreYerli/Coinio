import { join } from 'node:path';
import { Router, type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { requireSession } from '../auth/middleware.js';
import type { ServiceCtx } from '../services/context.js';
import { LOGO_FILE_RE, LOGO_MIME, MAX_LOGO_BYTES, replaceLogo, sniffLogoExt, storeUploadedLogo } from '../services/logos.js';
import { CandidateFetchError, UnknownCandidateError, brandSvg, candidateFile, candidateImage, getCandidates } from '../services/logoCandidates.js';
import { NotFoundError, getSubscription } from '../services/subscriptions.js';
import { subscriptionToApi } from './subscriptions.js';

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon']);
const idParam = z.coerce.number().int().positive();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_LOGO_BYTES, files: 1 } }).single('logo');

export function logosRouter(ctx: ServiceCtx): Router {
  const router = Router();

  router.post(
    '/api/subscriptions/:id/logo',
    requireSession(ctx.db, ctx.now),
    (req: Request, res: Response, next: NextFunction) => {
      try {
        const id = idParam.safeParse(req.params.id);
        if (!id.success) return void res.status(400).json({ error: 'validation' });
        getSubscription(ctx, req.userId!, id.data);
      } catch (err) {
        if (err instanceof NotFoundError) return void res.status(404).json({ error: 'not_found' });
        return next(err);
      }
      upload(req, res, (err?: unknown) => {
        if (err instanceof multer.MulterError) {
          return void res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: 'upload', code: err.code });
        }
        if (err) return void res.status(400).json({ error: 'upload' });
        const file = req.file;
        if (!file) return void res.status(400).json({ error: 'no_file' });
        const ext = sniffLogoExt(file.buffer);
        if (!ALLOWED_MIME.has(file.mimetype) || !ext) return void res.status(400).json({ error: 'unsupported_image' });
        const row = replaceLogo(ctx, Number(req.params.id), storeUploadedLogo(ctx, file.buffer, ext));
        res.json(subscriptionToApi(row));
      });
    },
  );

  const session = requireSession(ctx.db, ctx.now);
  const HOST_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/;
  const sendImage = (res: Response, buf: Buffer, ext: keyof typeof LOGO_MIME) => {
    res.type(LOGO_MIME[ext]);
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    res.send(buf);
  };
  const owned = (req: Request, res: Response): number | null => {
    const id = idParam.safeParse(req.params.id);
    if (!id.success) return void res.status(400).json({ error: 'validation' }), null;
    try {
      getSubscription(ctx, req.userId!, id.data);
      return id.data;
    } catch (err) {
      if (err instanceof NotFoundError) return void res.status(404).json({ error: 'not_found' }), null;
      throw err;
    }
  };

  router.get('/api/logos/candidates', session, async (req, res, next) => {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 100) : '';
      const raw = typeof req.query.domain === 'string' ? req.query.domain.trim().toLowerCase() : '';
      const domain = raw.length <= 253 && HOST_RE.test(raw) ? raw : null;
      res.json({ candidates: await getCandidates(ctx, q, domain) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/api/logos/proxy/:id', session, async (req, res, next) => {
    try {
      const image = await candidateImage(ctx, String(req.params.id));
      if (!image) return void res.status(404).end();
      res.set('Cache-Control', 'private, max-age=600');
      sendImage(res, image.buf, image.ext);
    } catch (err) {
      if (err instanceof UnknownCandidateError) return void res.status(404).end();
      next(err);
    }
  });

  router.get('/api/logos/brand/:file', (req, res) => {
    const file = String(req.params.file);
    const svg = file.endsWith('.svg') ? brandSvg(file.slice(0, -4), req.query.style === 'plain' ? 'plain' : 'filled') : null;
    if (!svg) return void res.status(404).end();
    res.set('Cache-Control', 'public, max-age=86400');
    sendImage(res, Buffer.from(svg), 'svg');
  });

  router.post('/api/subscriptions/:id/logo/select', session, async (req, res, next) => {
    try {
      const id = owned(req, res);
      if (id === null) return;
      const body = z.object({ candidateId: z.string().min(1).max(200), style: z.enum(['filled', 'plain']).default('filled') }).safeParse(req.body);
      if (!body.success) return void res.status(400).json({ error: 'validation' });
      const file = await candidateFile(ctx, body.data.candidateId, body.data.style);
      res.json(subscriptionToApi(replaceLogo(ctx, id, storeUploadedLogo(ctx, file.buf, file.ext))));
    } catch (err) {
      if (err instanceof UnknownCandidateError) return void res.status(400).json({ error: 'unknown_candidate' });
      if (err instanceof CandidateFetchError) return void res.status(502).json({ error: 'fetch_failed' });
      next(err);
    }
  });

  router.delete('/api/subscriptions/:id/logo', session, (req, res) => {
    const id = owned(req, res);
    if (id === null) return;
    res.json(subscriptionToApi(replaceLogo(ctx, id, null)));
  });

  router.get('/logos/:file', (req, res) => {
    const file = String(req.params.file);
    if (!LOGO_FILE_RE.test(file)) return void res.status(404).end();
    const ext = file.slice(file.lastIndexOf('.') + 1) as keyof typeof LOGO_MIME;
    res.type(LOGO_MIME[ext]);
    res.set('X-Content-Type-Options', 'nosniff');
    if (ext === 'svg') res.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'");
    res.set('Cache-Control', 'public, max-age=86400');
    res.sendFile(join(ctx.config.dataDir, 'logos', file), (err) => {
      if (err && !res.headersSent) res.status(404).end();
    });
  });

  return router;
}
