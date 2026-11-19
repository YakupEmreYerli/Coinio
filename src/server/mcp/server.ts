import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z, ZodError } from 'zod';
import type { PaymentRow, SubscriptionRow } from '../domain/summary.js';
import type { Scope } from '../auth/middleware.js';
import type { ServiceCtx } from '../services/context.js';
import {
  NotFoundError,
  createSubscription,
  deleteSubscription,
  getSummary,
  listPayments,
  listSubscriptions,
  markPaid,
  skipPayment,
  undoPayment,
  updateSubscription,
} from '../services/subscriptions.js';
import { VERSION } from '../../shared/brand.js';

export type McpCtx = ServiceCtx & { userId: number; scope: Scope };

const toMinor = (amount: number) => Math.round(amount * 100);
const toDecimal = (minor: number) => (minor / 100).toFixed(2);

const subscriptionOut = (s: SubscriptionRow) => ({
  id: s.id,
  name: s.name,
  amount: toDecimal(s.amountMinor),
  currency: s.currency,
  variable_amount: s.variableAmount,
  cycle: s.cycle,
  interval_count: s.intervalCount,
  next_due: s.nextDue,
  auto_pay: s.autoPay,
  payment_method: s.paymentMethod,
  category: s.category,
  domain: s.domain,
  notes: s.notes,
  reminder_days: s.reminderDays,
  active: s.active,
});

const paymentOut = (p: PaymentRow) => ({
  id: p.id,
  subscription_id: p.subscriptionId,
  due_date: p.dueDate,
  paid_at: p.paidAt,
  amount: toDecimal(p.amountMinor),
  currency: p.currency,
  actual_base_amount: p.actualBaseMinor === null ? null : toDecimal(p.actualBaseMinor),
  status: p.status,
  source: p.source,
});

function ok(data: object): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], structuredContent: data as Record<string, unknown> };
}

function fail(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

/** Wraps a tool body so service errors become MCP tool errors instead of protocol errors. */
function tool<A>(fn: (args: A) => object): (args: A) => CallToolResult {
  return (args) => {
    try {
      return ok(fn(args));
    } catch (err) {
      if (err instanceof NotFoundError) return fail(err.message);
      if (err instanceof ZodError) {
        return fail(`Invalid input: ${err.issues.map((i) => `${i.path.join('.') || 'value'}: ${i.message}`).join('; ')}`);
      }
      console.error('mcp tool failed', err);
      return fail('Internal error');
    }
  };
}

const money = z.number().min(0).describe('Decimal amount, e.g. 229.99');
const isoDate = z.string().describe('Date as YYYY-MM-DD');
const id = z.number().int().positive();

const writableFields = {
  name: z.string().describe('Subscription name, e.g. "Netflix"'),
  amount: money.describe("Amount per billing cycle in the subscription's own currency, e.g. 229.99"),
  currency: z.string().describe('ISO 4217 code with 2 decimals, e.g. TRY, USD, EUR'),
  cycle: z.enum(['weekly', 'monthly', 'yearly']),
  interval_count: z.number().int().describe('Bill every N cycles (default 1)'),
  next_due: isoDate.describe('Next due date, YYYY-MM-DD'),
  auto_pay: z.boolean().describe('True if the charge happens automatically (card on file); false if paid by hand'),
  variable_amount: z.boolean().describe('True if the charge differs each period (e.g. usage bills)'),
  reminder_days: z.number().int().describe('Days before the due date to send a reminder'),
  domain: z.string().nullable().describe('Website domain, e.g. netflix.com'),
  payment_method: z.string().nullable(),
  category: z.string().nullable(),
  notes: z.string().nullable(),
};

type Fields = { [K in keyof typeof writableFields]?: z.infer<(typeof writableFields)[K]> };

function toServiceFields(a: Fields) {
  return {
    name: a.name,
    amountMinor: a.amount === undefined ? undefined : toMinor(a.amount),
    currency: a.currency,
    cycle: a.cycle,
    intervalCount: a.interval_count,
    nextDue: a.next_due,
    autoPay: a.auto_pay,
    variableAmount: a.variable_amount,
    reminderDays: a.reminder_days,
    domain: a.domain,
    paymentMethod: a.payment_method,
    category: a.category,
    notes: a.notes,
  };
}

export function buildMcpServer(ctx: McpCtx): McpServer {
  const server = new McpServer({ name: 'coinio', version: VERSION });
  const { userId } = ctx;
  const readOnly = { readOnlyHint: true } as const;

  server.registerTool(
    'list_subscriptions',
    {
      description: 'List all active subscriptions with amount, currency, billing cycle and next due date, ordered by next due date.',
      annotations: readOnly,
    },
    tool(() => ({ subscriptions: listSubscriptions(ctx, userId).map(subscriptionOut) })),
  );

  server.registerTool(
    'get_upcoming_payments',
    {
      description:
        'List payments due within the next N days (default 30, at most 60), sorted by date; includes overdue manual (non-auto-pay) payments that are still unpaid, flagged overdue.',
      inputSchema: { days: z.number().int().min(1).max(60).default(30).describe('Look-ahead window in days') },
      annotations: readOnly,
    },
    tool(({ days }: { days: number }) => {
      const s = getSummary(ctx, userId, ctx.now());
      const item = (i: (typeof s.upcoming)[number]) => ({
        subscription_id: i.subscriptionId,
        name: i.name,
        due_date: i.dueDate,
        days_left: i.daysLeft,
        overdue: i.daysLeft < 0,
        amount: toDecimal(i.amountMinor),
        currency: i.currency,
        base_amount: i.baseMinor === null ? null : toDecimal(i.baseMinor),
        auto_pay: i.autoPay,
        variable_amount: i.variableAmount,
      });
      return {
        base_currency: s.base,
        payments: [...s.overdue, ...s.upcoming.filter((i) => i.daysLeft <= days)].map(item),
      };
    }),
  );

  server.registerTool(
    'get_monthly_summary',
    {
      description:
        'Get the spending summary in the base currency: amount still left to pay this month, monthly average, yearly total, and what was already paid this month.',
      annotations: readOnly,
    },
    tool(() => {
      const s = getSummary(ctx, userId, ctx.now());
      return {
        base_currency: s.base,
        left_this_month: toDecimal(s.leftThisMonthMinor),
        monthly_average: toDecimal(s.monthlyAverageMinor),
        yearly_total: toDecimal(s.yearlyTotalMinor),
        rates_stale: s.ratesStale,
        unconvertible_subscription_ids: s.unconvertible,
        paid_this_month: s.paidThisMonth.map((p) => ({
          payment_id: p.paymentId,
          subscription_id: p.subscriptionId,
          name: p.name,
          due_date: p.dueDate,
          paid_at: p.paidAt,
          amount: toDecimal(p.amountMinor),
          currency: p.currency,
          source: p.source,
        })),
      };
    }),
  );

  server.registerTool(
    'get_payment_history',
    {
      description: 'List recorded payments, newest first, optionally for one subscription; limit defaults to 20.',
      inputSchema: {
        subscription_id: id.optional().describe('Only payments of this subscription'),
        limit: z.number().int().min(1).max(200).default(20),
      },
      annotations: readOnly,
    },
    tool(({ subscription_id, limit }: { subscription_id?: number; limit: number }) => ({
      payments: listPayments(ctx, userId, { subscriptionId: subscription_id }).slice(0, limit).map(paymentOut),
    })),
  );

  if (ctx.scope !== 'full') return server;

  server.registerTool(
    'add_subscription',
    {
      description: 'Create a new subscription. Amounts are decimal numbers in the subscription currency.',
      inputSchema: {
        name: writableFields.name,
        amount: writableFields.amount,
        currency: writableFields.currency,
        cycle: writableFields.cycle,
        next_due: writableFields.next_due,
        interval_count: writableFields.interval_count.optional(),
        auto_pay: writableFields.auto_pay.optional(),
        variable_amount: writableFields.variable_amount.optional(),
        reminder_days: writableFields.reminder_days.optional(),
        domain: writableFields.domain.optional(),
        payment_method: writableFields.payment_method.optional(),
        category: writableFields.category.optional(),
        notes: writableFields.notes.optional(),
      },
    },
    tool((a: Fields) => {
      const f = toServiceFields(a);
      const input = Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined));
      return { subscription: subscriptionOut(createSubscription(ctx, userId, { intervalCount: 1, ...input })) };
    }),
  );

  server.registerTool(
    'update_subscription',
    {
      description: 'Change fields of an existing subscription; only the fields you pass are changed. Set active=false to pause it.',
      inputSchema: {
        id,
        ...Object.fromEntries(Object.entries(writableFields).map(([k, v]) => [k, v.optional()])),
        active: z.boolean().optional().describe('False pauses the subscription'),
      } as { id: typeof id } & { [K in keyof typeof writableFields]: z.ZodOptional<(typeof writableFields)[K]> } & { active: z.ZodOptional<z.ZodBoolean> },
    },
    tool((a: Fields & { id: number; active?: boolean }) => {
      const f = toServiceFields(a);
      const patch = Object.fromEntries(Object.entries({ ...f, active: a.active }).filter(([, v]) => v !== undefined));
      return { subscription: subscriptionOut(updateSubscription(ctx, userId, a.id, patch)) };
    }),
  );

  server.registerTool(
    'mark_paid',
    {
      description:
        'Record a payment for a subscription (default: its current next due date) and advance it to the next cycle. Pass amount when a variable bill differs from the usual, actual_base_amount for what the card was really charged in the base currency.',
      inputSchema: {
        id,
        due_date: isoDate.optional().describe('Which due date was paid; defaults to the next due date'),
        amount: money.optional().describe("Actual amount in the subscription's currency"),
        actual_base_amount: money.optional().describe('Amount actually charged in the base currency'),
      },
    },
    tool((a: { id: number; due_date?: string; amount?: number; actual_base_amount?: number }) => ({
      payment: paymentOut(
        markPaid(ctx, userId, a.id, {
          dueDate: a.due_date,
          amountMinor: a.amount === undefined ? undefined : toMinor(a.amount),
          actualBaseMinor: a.actual_base_amount === undefined ? undefined : toMinor(a.actual_base_amount),
          now: ctx.now(),
        }),
      ),
    })),
  );

  server.registerTool(
    'skip_payment',
    {
      description: 'Skip one billing period (default: the next due date) without paying; it counts as nothing in totals and the subscription moves to the next cycle. Undo with undo_payment.',
      inputSchema: {
        id,
        due_date: isoDate.optional().describe('Which due date to skip; defaults to the next due date'),
      },
    },
    tool((a: { id: number; due_date?: string }) => ({
      payment: paymentOut(skipPayment(ctx, userId, a.id, { dueDate: a.due_date, now: ctx.now() })),
    })),
  );

  server.registerTool(
    'undo_payment',
    {
      description: 'Undo a recorded payment by payment id (see get_payment_history); a manual payment reopens its due date.',
      inputSchema: { payment_id: id },
    },
    tool(({ payment_id }: { payment_id: number }) => {
      undoPayment(ctx, userId, payment_id);
      return { undone: payment_id };
    }),
  );

  server.registerTool(
    'delete_subscription',
    {
      description: 'Permanently delete a subscription and its payment history. This cannot be undone; prefer update_subscription with active=false to pause.',
      inputSchema: { id },
      annotations: { destructiveHint: true },
    },
    tool(({ id: subId }: { id: number }) => {
      deleteSubscription(ctx, userId, subId);
      return { deleted: subId };
    }),
  );

  return server;
}
