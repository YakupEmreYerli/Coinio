import { Router, type RequestHandler, type Response } from 'express';
import { z, ZodError } from 'zod';
import { PayInput, PaymentQuery, SkipInput } from '../../shared/types.js';
import { requireSession } from '../auth/middleware.js';
import type { PaymentRow, SubscriptionRow } from '../domain/summary.js';
import type { ServiceCtx } from '../services/context.js';
import {
  NotFoundError,
  createSubscription,
  deleteSubscription,
  getSubscription,
  getSummary,
  listPayments,
  listSubscriptions,
  markPaid,
  skipPayment,
  undoPayment,
  updatePayment,
  updateSubscription,
} from '../services/subscriptions.js';

/** Explicit mappers so REST never exposes raw drizzle rows. */
export function subscriptionToApi(s: SubscriptionRow) {
  return {
    id: s.id,
    name: s.name,
    domain: s.domain,
    logoPath: s.logoPath,
    amountMinor: s.amountMinor,
    currency: s.currency,
    variableAmount: s.variableAmount,
    cycle: s.cycle,
    intervalCount: s.intervalCount,
    anchorDay: s.anchorDay,
    nextDue: s.nextDue,
    autoPay: s.autoPay,
    paymentMethod: s.paymentMethod,
    category: s.category,
    notes: s.notes,
    reminderDays: s.reminderDays,
    active: s.active,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

export function paymentToApi(p: PaymentRow) {
  return {
    id: p.id,
    subscriptionId: p.subscriptionId,
    dueDate: p.dueDate,
    paidAt: p.paidAt,
    amountMinor: p.amountMinor,
    currency: p.currency,
    actualBaseMinor: p.actualBaseMinor,
    source: p.source,
    status: p.status,
  };
}

export function handle(fn: (req: Parameters<RequestHandler>[0], res: Response) => void): RequestHandler {
  return (req, res, next) => {
    try {
      fn(req, res);
    } catch (err) {
      if (err instanceof ZodError) res.status(400).json({ error: 'validation', issues: err.issues });
      else if (err instanceof NotFoundError) res.status(404).json({ error: 'not_found' });
      else next(err);
    }
  };
}

const idParam = z.coerce.number().int().positive();

export function subscriptionsRouter(ctx: ServiceCtx): Router {
  const router = Router();
  router.use(['/subscriptions', '/payments', '/summary'], requireSession(ctx.db, ctx.now));

  router.get('/subscriptions', handle((req, res) => {
    const includeInactive = req.query.includeInactive === 'true';
    res.json(listSubscriptions(ctx, req.userId!, { includeInactive }).map(subscriptionToApi));
  }));
  router.post('/subscriptions', handle((req, res) => {
    res.status(201).json(subscriptionToApi(createSubscription(ctx, req.userId!, req.body)));
  }));
  router.get('/subscriptions/:id', handle((req, res) => {
    res.json(subscriptionToApi(getSubscription(ctx, req.userId!, idParam.parse(req.params.id))));
  }));
  router.patch('/subscriptions/:id', handle((req, res) => {
    res.json(subscriptionToApi(updateSubscription(ctx, req.userId!, idParam.parse(req.params.id), req.body)));
  }));
  router.delete('/subscriptions/:id', handle((req, res) => {
    deleteSubscription(ctx, req.userId!, idParam.parse(req.params.id));
    res.status(204).end();
  }));
  router.post('/subscriptions/:id/pay', handle((req, res) => {
    const body = PayInput.parse(req.body ?? {});
    const payment: PaymentRow = markPaid(ctx, req.userId!, idParam.parse(req.params.id), { ...body, now: ctx.now() });
    res.status(201).json(paymentToApi(payment));
  }));

  router.post('/subscriptions/:id/skip', handle((req, res) => {
    const body = SkipInput.parse(req.body ?? {});
    res.status(201).json(paymentToApi(skipPayment(ctx, req.userId!, idParam.parse(req.params.id), { ...body, now: ctx.now() })));
  }));

  router.get('/payments', handle((req, res) => {
    res.json(listPayments(ctx, req.userId!, PaymentQuery.parse(req.query)).map(paymentToApi));
  }));
  router.patch('/payments/:id', handle((req, res) => {
    res.json(paymentToApi(updatePayment(ctx, req.userId!, idParam.parse(req.params.id), req.body)));
  }));
  router.delete('/payments/:id', handle((req, res) => {
    undoPayment(ctx, req.userId!, idParam.parse(req.params.id));
    res.status(204).end();
  }));

  router.get('/summary', handle((req, res) => {
    res.json(getSummary(ctx, req.userId!, ctx.now()));
  }));

  return router;
}
