import { Router, type ErrorRequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { requireSession } from '../auth/middleware.js';
import { SESSION_COOKIE, createSession, findSessionUserId, sessionCookieOptions } from '../auth/sessions.js';
import type { ServiceCtx } from '../services/context.js';
import {
  acceptInvite,
  addMember,
  createFamily,
  createInvite,
  deleteFamily,
  deleteMember,
  getFamilyState,
  leaveFamily,
  previewInvite,
  revokeInvite,
  updateFamily,
  updateMember,
} from '../services/family.js';
import {
  AcceptInviteInput,
  CreateFamilyInput,
  CreateInviteInput,
  CreateMemberInput,
  UpdateFamilyInput,
  UpdateMemberInput,
} from '../../shared/types.js';
import { handle } from './subscriptions.js';

const idParam = z.coerce.number().int().positive();
const tokenParam = z.string().trim().min(10).max(128);

export function familyRouter(ctx: ServiceCtx): Router {
  const router = Router();
  const auth = requireSession(ctx.db, ctx.now);

  const inviteLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: 'too_many_attempts' });
    },
  });

  const sessionUser = (req: Parameters<typeof findSessionUserId>[0] extends never ? never : { cookies?: Record<string, unknown> }) => {
    const sid = req.cookies?.[SESSION_COOKIE];
    return typeof sid === 'string' ? findSessionUserId(ctx.db, sid, ctx.now()) : null;
  };

  router.get('/invite/:token', inviteLimiter, handle((req, res) => {
    const token = tokenParam.parse(req.params.token);
    res.json(previewInvite(ctx, token, sessionUser(req)));
  }));

  router.post('/invite/:token/accept', inviteLimiter, async (req, res, next) => {
    try {
      const token = tokenParam.parse(req.params.token);
      const body = AcceptInviteInput.parse(req.body ?? {});
      const result = await acceptInvite(ctx, token, {
        sessionUserId: sessionUser(req),
        username: body.username,
        password: body.password,
        displayName: body.displayName,
        relation: body.relation,
      });
      if (result.created) {
        res.cookie(SESSION_COOKIE, createSession(ctx.db, result.userId, ctx.now()), sessionCookieOptions(req));
        for (const plugin of ctx.plugins ?? []) plugin.onSignIn?.(ctx, result.userId, 'password');
      }
      res.status(result.created ? 201 : 200).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/', auth, handle((req, res) => {
    res.json(getFamilyState(ctx, req.userId!));
  }));

  router.post('/', auth, handle((req, res) => {
    const body = CreateFamilyInput.parse(req.body ?? {});
    res.status(201).json(createFamily(ctx, req.userId!, body));
  }));

  router.patch('/', auth, handle((req, res) => {
    const body = UpdateFamilyInput.parse(req.body ?? {});
    res.json(updateFamily(ctx, req.userId!, body));
  }));

  router.delete('/', auth, handle((req, res) => {
    deleteFamily(ctx, req.userId!);
    res.status(204).end();
  }));

  router.post('/leave', auth, handle((req, res) => {
    leaveFamily(ctx, req.userId!);
    res.status(204).end();
  }));

  router.post('/members', auth, handle((req, res) => {
    const body = CreateMemberInput.parse(req.body ?? {});
    res.status(201).json(addMember(ctx, req.userId!, body));
  }));

  router.patch('/members/:id', auth, handle((req, res) => {
    const body = UpdateMemberInput.parse(req.body ?? {});
    res.json(updateMember(ctx, req.userId!, idParam.parse(req.params.id), body));
  }));

  router.delete('/members/:id', auth, handle((req, res) => {
    res.json(deleteMember(ctx, req.userId!, idParam.parse(req.params.id)));
  }));

  router.post('/invites', auth, handle((req, res) => {
    const body = CreateInviteInput.parse(req.body ?? {});
    res.status(201).json(createInvite(ctx, req.userId!, body.memberId));
  }));

  router.delete('/invites/:id', auth, handle((req, res) => {
    revokeInvite(ctx, req.userId!, idParam.parse(req.params.id));
    res.status(204).end();
  }));

  // Map domain errors raised by the async invite-accept handler above.
  const onError: ErrorRequestHandler = (err, req, res, next) => {
    handle(() => {
      throw err;
    })(req, res, next);
  };
  router.use(onError);

  return router;
}
