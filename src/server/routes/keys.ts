import { Router } from 'express';
import { z } from 'zod';
import { requireSession } from '../auth/middleware.js';
import { disconnectClient, listConnectedClients } from '../oauth/provider.js';
import { createApiKey, listApiKeys, revokeApiKey } from '../services/apiKeys.js';
import type { ServiceCtx } from '../services/context.js';
import { handle } from './subscriptions.js';

const CreateKey = z.object({ name: z.string().trim().min(1).max(100), scope: z.enum(['read', 'full']) });

export function keysRouter(ctx: ServiceCtx): Router {
  const router = Router();
  router.use(requireSession(ctx.db, ctx.now));
  router.get('/', handle((req, res) => {
    res.json(listApiKeys(ctx, req.userId!).map((k) => ({
      id: k.id, name: k.name, prefix: k.prefix, scope: k.scope, createdAt: k.createdAt, lastUsedAt: k.lastUsedAt,
    })));
  }));
  router.post('/', handle((req, res) => {
    const { name, scope } = CreateKey.parse(req.body);
    const { key, id } = createApiKey(ctx, req.userId!, name, scope);
    res.status(201).json({ id, name, scope, prefix: key.slice(0, 12), key });
  }));
  router.delete('/:id', handle((req, res) => {
    revokeApiKey(ctx, req.userId!, z.coerce.number().int().positive().parse(req.params.id));
    res.status(204).end();
  }));
  return router;
}

/** Apps connected through OAuth (claude.ai, Claude mobile): list and disconnect. */
export function oauthClientsRouter(ctx: ServiceCtx): Router {
  const router = Router();
  router.use(requireSession(ctx.db, ctx.now));
  router.get('/', handle((req, res) => {
    res.json(listConnectedClients(ctx, req.userId!).map((c) => ({
      clientId: c.clientId, clientName: c.clientName, createdAt: c.createdAt, lastUsedAt: c.lastUsedAt, activeTokenCount: c.activeTokenCount,
    })));
  }));
  router.delete('/:id', handle((req, res) => {
    disconnectClient(ctx, z.string().min(1).parse(req.params.id));
    res.status(204).end();
  }));
  return router;
}
