import { Router } from 'express';
import { z } from 'zod';
import { requireSession } from '../auth/middleware.js';
import type { ServiceCtx } from '../services/context.js';
import { UnknownFileError, importCoinio } from '../services/coinioImport.js';
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
  const Files = z.object({ files: z.array(z.object({ name: z.string().max(200), text: z.string() })).min(1).max(5), dryRun: z.boolean() });
  router.post('/coinio', handle((req, res) => {
    const { files, dryRun } = Files.parse(req.body);
    try {
      res.json(importCoinio(ctx, req.userId!, files, dryRun));
    } catch (err) {
      if (err instanceof UnknownFileError) return void res.status(422).json({ error: 'unknown_file', file: err.file });
      throw err;
    }
  }));
  return router;
}
