import { Router, type RequestHandler } from 'express';
import { z, ZodError } from 'zod';
import { requireSession } from '../auth/middleware.js';
import { NotFoundError } from '../services/errors.js';
import type { ServiceCtx } from '../services/context.js';
import { FireflyError, listAssetAccounts } from '../services/firefly/client.js';
import {
  connOf, connectionToApi, deleteConnection, getConnection, getLinkAccount, patchConnection, saveConnection, setLinkAccount,
} from '../services/firefly/store.js';
import { previewInitial, runInitial, syncUser } from '../services/firefly/sync.js';

const idParam = z.coerce.number().int().positive();

/** Like `handle`, for async bodies: validation → 400, missing → 404, Firefly failure → 502 with its code. */
function route(fn: (req: Parameters<RequestHandler>[0], res: Parameters<RequestHandler>[1]) => unknown): RequestHandler {
  return async (req, res, next) => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof ZodError) res.status(400).json({ error: 'validation', issues: err.issues });
      else if (err instanceof NotFoundError) res.status(404).json({ error: 'not_found' });
      else if (err instanceof FireflyError) res.status(502).json({ error: 'firefly', message: err.code });
      else next(err);
    }
  };
}

const Excluded = z.object({ subscriptions: z.array(z.number().int().positive()), bills: z.array(z.string()) });

export function fireflyRouter(ctx: ServiceCtx): Router {
  const router = Router();
  router.use(requireSession(ctx.db, ctx.now));

  const connection = (userId: number) => {
    const row = getConnection(ctx, userId);
    if (!row) throw new NotFoundError('firefly connection');
    return row;
  };

  router.get('/', route((req, res) => {
    const row = getConnection(ctx, req.userId!);
    res.json({ connection: row && connectionToApi(row) });
  }));

  router.put('/', route(async (req, res) => {
    res.json(await saveConnection(ctx, req.userId!, z.object({ baseUrl: z.url(), token: z.string().optional() }).parse(req.body)));
  }));

  router.get('/accounts', route(async (req, res) => {
    res.json({ accounts: await listAssetAccounts(ctx, connOf(connection(req.userId!))) });
  }));

  router.patch('/', route((req, res) => {
    const patch = z.object({ assetAccountId: z.string().min(1).optional(), enabled: z.boolean().optional(), excluded: Excluded.optional() }).parse(req.body);
    res.json(connectionToApi(patchConnection(ctx, req.userId!, patch)));
  }));

  router.delete('/', route((req, res) => {
    deleteConnection(ctx, req.userId!);
    res.status(204).end();
  }));

  router.get('/preview', route(async (req, res) => {
    res.json(await previewInitial(ctx, req.userId!));
  }));

  router.post('/initial', route(async (req, res) => {
    const choice = z.object({ unmatch: z.array(z.number().int().positive()), exclude: Excluded }).parse(req.body);
    if (connection(req.userId!).initialSyncDone) return void res.status(409).json({ error: 'initial_done' });
    res.json(await runInitial(ctx, req.userId!, choice));
  }));

  router.post('/sync', route(async (req, res) => {
    const row = connection(req.userId!);
    if (!row.initialSyncDone) return void res.status(409).json({ error: 'initial_required' });
    if (!row.enabled) return void res.status(409).json({ error: 'disabled' });
    res.json(await syncUser(ctx, req.userId!));
  }));

  router.get('/links/:subscriptionId', route((req, res) => {
    const link = getLinkAccount(ctx, req.userId!, idParam.parse(req.params.subscriptionId));
    if (!link) throw new NotFoundError('firefly link');
    res.json(link);
  }));

  router.put('/links/:subscriptionId', route((req, res) => {
    const { assetAccountId } = z.object({ assetAccountId: z.string().min(1).nullable() }).parse(req.body);
    setLinkAccount(ctx, req.userId!, idParam.parse(req.params.subscriptionId), assetAccountId);
    res.status(204).end();
  }));

  return router;
}
