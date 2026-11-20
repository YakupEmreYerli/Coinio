import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { buildMcpServer } from '../src/server/mcp/server.js';
import { createApiKey } from '../src/server/services/apiKeys.js';
import type { ServiceCtx } from '../src/server/services/context.js';
import { subscriptions } from '../src/server/db/schema.js';
import { makeTestApp } from './helpers.js';

async function setup() {
  const t = makeTestApp();
  await request(t.app).post('/api/auth/setup').send({ username: 'yakup', password: 'correct horse battery' });
  const ctx: ServiceCtx = { db: t.db, config: t.config, fetch, now: () => t.clock.now };
  const connect = async (scope: 'read' | 'full') => {
    const server = buildMcpServer({ ...ctx, userId: 1, scope });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '0' });
    await Promise.all([server.connect(a), client.connect(b)]);
    return client;
  };
  const text = (r: unknown) => JSON.parse((r as { content: { text: string }[] }).content[0]!.text);
  return { ...t, ctx, connect, text };
}

const netflix = { name: 'Netflix', amount: 229.99, currency: 'TRY', cycle: 'monthly', next_due: '2026-12-01' };

describe('mcp tools', () => {
  it('lists 10 tools for full scope and 4 for read scope', async () => {
    const { connect } = await setup();
    const full = (await (await connect('full')).listTools()).tools;
    expect(full.map((x) => x.name).sort()).toEqual([
      'add_subscription', 'delete_subscription', 'get_monthly_summary', 'get_payment_history', 'get_upcoming_payments',
      'list_subscriptions', 'mark_paid', 'skip_payment', 'undo_payment', 'update_subscription',
    ]);
    expect(full.find((x) => x.name === 'delete_subscription')?.annotations?.destructiveHint).toBe(true);
    const read = (await (await connect('read')).listTools()).tools;
    expect(read.map((x) => x.name).sort()).toEqual([
      'get_monthly_summary', 'get_payment_history', 'get_upcoming_payments', 'list_subscriptions',
    ]);
    expect(read.every((x) => x.annotations?.readOnlyHint === true)).toBe(true);
  });

  it('read scope cannot call a write tool', async () => {
    const { connect, db } = await setup();
    const res = await (await connect('read')).callTool({ name: 'add_subscription', arguments: netflix });
    expect(res.isError).toBe(true);
    expect(JSON.stringify(res.content)).toContain('not found');
    expect(db.select().from(subscriptions).all()).toHaveLength(0);
  });

  it('tells the client a read-only connection cannot change anything', async () => {
    const { connect } = await setup();
    expect((await connect('read')).getInstructions()).toMatch(/read-only.*Full access/s);
    expect((await connect('full')).getInstructions()).toBeUndefined();
  });

  it('rejects malformed due dates for mark_paid and skip_payment', async () => {
    const { connect, db, text } = await setup();
    const c = await connect('full');
    const subId = text(await c.callTool({ name: 'add_subscription', arguments: netflix })).subscription.id;
    for (const name of ['mark_paid', 'skip_payment']) {
      for (const due_date of ['bad', '2026-02-30']) {
        const res = await c.callTool({ name, arguments: { id: subId, due_date } });
        expect(res.isError, `${name} ${due_date}`).toBe(true);
      }
    }
    expect(text(await c.callTool({ name: 'get_payment_history', arguments: {} })).payments).toHaveLength(0);
    expect(db.select().from(subscriptions).get()?.nextDue).toBe('2026-12-01');
  });

  it('add_subscription stores minor units and returns decimal amount', async () => {
    const { connect, db, text } = await setup();
    const res = await (await connect('full')).callTool({ name: 'add_subscription', arguments: netflix });
    expect(res.isError).toBeFalsy();
    expect(text(res).subscription).toMatchObject({ name: 'Netflix', amount: '229.99', currency: 'TRY', next_due: '2026-12-01' });
    expect(db.select().from(subscriptions).get()?.amountMinor).toBe(22999);
  });

  it('takes and returns whole yen for JPY, refusing decimals', async () => {
    const { connect, db, text } = await setup();
    const c = await connect('full');
    const res = await c.callTool({ name: 'add_subscription', arguments: { ...netflix, amount: 1590, currency: 'JPY', auto_pay: false } });
    expect(text(res).subscription).toMatchObject({ amount: '1590', currency: 'JPY' });
    expect(db.select().from(subscriptions).get()?.amountMinor).toBe(1590);
    const id = text(res).subscription.id;
    expect(text(await c.callTool({ name: 'update_subscription', arguments: { id, amount: 1790 } })).subscription.amount).toBe('1790');
    const fractional = await c.callTool({ name: 'update_subscription', arguments: { id, amount: 1790.5 } });
    expect(fractional.isError).toBe(true);
    expect(JSON.stringify(fractional.content)).toContain('JPY amounts have at most 0 decimals');
    expect((await c.callTool({ name: 'add_subscription', arguments: { ...netflix, amount: 1.5, currency: 'JPY' } })).isError).toBe(true);
    expect(text(await c.callTool({ name: 'update_subscription', arguments: { id, amount: 12.99, currency: 'USD' } })).subscription).toMatchObject({ amount: '12.99', currency: 'USD' });
    await c.callTool({ name: 'update_subscription', arguments: { id, amount: 1590, currency: 'JPY' } });
    const paid = text(await c.callTool({ name: 'mark_paid', arguments: { id, amount: 1600, actual_base_amount: 10.5 } }));
    expect(paid.payment).toMatchObject({ amount: '1600', currency: 'JPY', actual_base_amount: '10.50' });
  });

  it('returns tool errors for invalid input and unknown ids', async () => {
    const { connect } = await setup();
    const c = await connect('full');
    const bad = await c.callTool({ name: 'add_subscription', arguments: { ...netflix, currency: 'XXXX' } });
    expect(bad.isError).toBe(true);
    const unknown = await c.callTool({ name: 'add_subscription', arguments: { ...netflix, currency: 'XXX' } });
    expect(unknown.isError).toBe(true);
    const missing = await c.callTool({ name: 'delete_subscription', arguments: { id: 999 } });
    expect(missing.isError).toBe(true);
    expect(JSON.stringify(missing.content)).toContain('subscription not found');
  });

  it('get_upcoming_payments is date-sorted, honours days and includes overdue manual ones', async () => {
    const { connect, text } = await setup();
    const c = await connect('full');
    await c.callTool({ name: 'add_subscription', arguments: { ...netflix, name: 'Late', next_due: '2026-12-10' } });
    await c.callTool({ name: 'add_subscription', arguments: { ...netflix, name: 'Soon', next_due: '2026-11-20' } });
    await c.callTool({ name: 'add_subscription', arguments: { ...netflix, name: 'Behind', next_due: '2026-11-10', auto_pay: false } });
    const dates = (r: unknown) => text(r).payments.map((p: { due_date: string }) => p.due_date);
    const res = await c.callTool({ name: 'get_upcoming_payments', arguments: { days: 30 } });
    expect(dates(res)).toEqual(['2026-11-10', '2026-11-20', '2026-12-10', '2026-12-10']);
    expect(text(res).payments[0]).toMatchObject({ name: 'Behind', overdue: true, amount: '229.99', currency: 'TRY' });
    const short = await c.callTool({ name: 'get_upcoming_payments', arguments: { days: 5 } });
    expect(dates(short)).toEqual(['2026-11-10', '2026-11-20']);
  });

  it('mark_paid, payment history, undo and update work end to end', async () => {
    const { connect, text } = await setup();
    const c = await connect('full');
    const added = text(await c.callTool({ name: 'add_subscription', arguments: { ...netflix, auto_pay: false } }));
    const subId = added.subscription.id;
    const paid = text(await c.callTool({ name: 'mark_paid', arguments: { id: subId, amount: 249.5, actual_base_amount: 250 } }));
    expect(paid.payment).toMatchObject({ amount: '249.50', actual_base_amount: '250.00', due_date: '2026-12-01' });
    const hist = text(await c.callTool({ name: 'get_payment_history', arguments: { subscription_id: subId } }));
    expect(hist.payments).toHaveLength(1);
    const upd = text(await c.callTool({ name: 'update_subscription', arguments: { id: subId, amount: 300, notes: null } }));
    expect(upd.subscription).toMatchObject({ amount: '300.00', next_due: '2027-01-01', notes: null });
    await c.callTool({ name: 'undo_payment', arguments: { payment_id: paid.payment.id } });
    expect(text(await c.callTool({ name: 'get_payment_history', arguments: {} })).payments).toHaveLength(0);
    const sum = text(await c.callTool({ name: 'get_monthly_summary', arguments: {} }));
    expect(sum.base_currency).toBeTypeOf('string');
    expect(text(await c.callTool({ name: 'delete_subscription', arguments: { id: subId } }))).toEqual({ deleted: subId });
    expect(text(await c.callTool({ name: 'list_subscriptions', arguments: {} })).subscriptions).toEqual([]);
  });
});

describe('POST /mcp', () => {
  const headers = { Accept: 'application/json, text/event-stream', 'Content-Type': 'application/json' };
  const listBody = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} };

  it('rejects requests without a valid token', async () => {
    const { app } = await setup();
    expect((await request(app).post('/mcp').set(headers).send(listBody)).status).toBe(401);
    expect((await request(app).post('/mcp').set(headers).set('Authorization', 'Bearer nope').send(listBody)).status).toBe(401);
  });

  it('serves tools/list over HTTP scoped by key, and 405s GET/DELETE', async () => {
    const { app, ctx } = await setup();
    const names = async (scope: 'read' | 'full') => {
      const { key } = createApiKey(ctx, 1, 'k', scope);
      const res = await request(app).post('/mcp').set(headers).set('Authorization', `Bearer ${key}`).buffer(true).parse((r, cb) => {
        let d = '';
        r.on('data', (c) => (d += c));
        r.on('end', () => cb(null, d));
      }).send(listBody);
      expect(res.status).toBe(200);
      const json = String(res.body).match(/data: (.*)/)?.[1] ?? String(res.body);
      return JSON.parse(json).result.tools.length as number;
    };
    expect(await names('full')).toBe(10);
    expect(await names('read')).toBe(4);
    expect((await request(app).get('/mcp')).status).toBe(405);
    expect((await request(app).delete('/mcp')).status).toBe(405);
  });
});
