import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { payments } from '../src/server/db/schema.js';
import { makeTestApp } from './helpers.js';

async function login() {
  const t = makeTestApp();
  const agent = request.agent(t.app);
  await agent.post('/api/auth/setup').send({ username: 'yakup', password: 'correct horse battery' });
  return { ...t, agent };
}

const tricky = {
  name: 'Acme, "Pro" plan',
  amountMinor: 123456,
  currency: 'USD',
  cycle: 'monthly',
  intervalCount: 1,
  nextDue: '2026-12-05',
  notes: 'line one\nline two',
};

describe('export', () => {
  it('requires a session and a valid format', async () => {
    const { app, agent } = await login();
    expect((await request(app).get('/api/export?format=csv&what=subscriptions')).status).toBe(401);
    expect((await agent.get('/api/export?format=xml&what=subscriptions')).status).toBe(400);
    expect((await agent.get('/api/export?format=csv&what=users')).status).toBe(400);
  });

  it('csv export escapes commas and quotes', async () => {
    const { agent } = await login();
    await agent.post('/api/subscriptions').send(tricky);
    const res = await agent.get('/api/export?format=csv&what=subscriptions');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv/);
    expect(res.headers['content-disposition']).toBe('attachment; filename="coinio-subscriptions-2026-11-18.csv"');
    const lines = res.text.split('\r\n');
    expect(lines[0]).toBe('id,name,domain,amount,currency,variable_amount,cycle,interval_count,next_due,auto_pay,payment_method,category,notes,reminder_offsets,trial_ends_at,active,created_at');
    expect(lines[1]).toContain('"Acme, ""Pro"" plan",,1234.56,USD,false,monthly,1,2026-12-05,true,,,"line one\nline two"');
  });

  it('csv export neutralizes leading spreadsheet formula characters', async () => {
    const { agent } = await login();
    await agent.post('/api/subscriptions').send({
      ...tricky,
      name: '=cmd|"/C calc"!A0',
      paymentMethod: '+1-card',
      category: '@sum',
      notes: '-danger',
    });
    const res = await agent.get('/api/export?format=csv&what=subscriptions');
    expect(res.status).toBe(200);
    expect(res.text).toContain('"\'=cmd|""/C calc""!A0"');
    expect(res.text).toContain(",'+1-card,'@sum,'-danger,");
  });

  it('csv payments export uses decimal amounts', async () => {
    const { agent, db } = await login();
    const sub = (await agent.post('/api/subscriptions').send(tricky)).body;
    db.insert(payments).values({
      subscriptionId: sub.id, dueDate: '2026-11-05', paidAt: '2026-11-05T08:00:00Z', amountMinor: 5, currency: 'USD',
      actualBaseMinor: 21250, source: 'manual',
    }).run();
    const res = await agent.get('/api/export?format=csv&what=payments');
    const lines = res.text.split('\r\n');
    expect(lines[0]).toBe('id,subscription_id,subscription_name,due_date,paid_at,amount,currency,actual_base_amount,source,status');
    expect(lines[1]).toBe(`1,${sub.id},"Acme, ""Pro"" plan",2026-11-05,2026-11-05T08:00:00Z,0.05,USD,212.50,manual,paid`);
  });

  it('csv writes yen amounts without decimals, in the base currency for actual amounts', async () => {
    const { agent, db } = await login();
    await agent.patch('/api/settings').send({ baseCurrency: 'JPY' });
    const sub = (await agent.post('/api/subscriptions').send({ ...tricky, name: 'Netflix', amountMinor: 1590, currency: 'JPY' })).body;
    expect((await agent.get('/api/export?format=csv&what=subscriptions')).text).toContain('Netflix,,1590,JPY,');
    db.insert(payments).values({
      subscriptionId: sub.id, dueDate: '2026-11-05', paidAt: '2026-11-05T08:00:00Z', amountMinor: 2000, currency: 'USD',
      actualBaseMinor: 3100, source: 'manual',
    }).run();
    expect((await agent.get('/api/export?format=csv&what=payments')).text).toContain(',20.00,USD,3100,manual,paid');
  });

  it('json export lists subscriptions', async () => {
    const { agent } = await login();
    await agent.post('/api/subscriptions').send(tricky);
    await agent.post('/api/subscriptions').send({ ...tricky, name: 'Paused' }).then((r) =>
      agent.patch(`/api/subscriptions/${r.body.id}`).send({ active: false }));
    const res = await agent.get('/api/export?format=json&what=subscriptions');
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toBe('attachment; filename="coinio-subscriptions-2026-11-18.json"');
    const body = JSON.parse(res.text);
    expect(body.map((s: { name: string }) => s.name)).toEqual(['Acme, "Pro" plan', 'Paused']);
    expect(body[0]).toMatchObject({ amountMinor: 123456, currency: 'USD', notes: 'line one\nline two' });
  });
});
