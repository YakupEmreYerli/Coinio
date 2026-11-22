import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { makeTestApp } from './helpers.js';

async function login() {
  const t = makeTestApp();
  const agent = request.agent(t.app);
  await agent.post('/api/auth/setup').send({ username: 'yakup', password: 'correct horse battery' });
  return { ...t, agent };
}

const netflix = {
  name: 'Netflix, "Premium"',
  domain: 'netflix.com',
  amountMinor: 22999,
  currency: 'TRY',
  cycle: 'monthly',
  intervalCount: 1,
  nextDue: '2026-12-05',
  autoPay: true,
  paymentMethod: 'Card',
  category: 'Streaming',
  notes: 'line one\nline two',
  reminderOffsets: [3, 1],
};
const domain = { name: 'getcoinio.me', amountMinor: 2000, currency: 'USD', cycle: 'yearly', intervalCount: 1, nextDue: '2027-11-19', autoPay: false };

/** A source instance with two subscriptions (one inactive) and one paid payment; returns its export files. */
async function source() {
  const s = await login();
  const a = (await s.agent.post('/api/subscriptions').send(netflix).expect(201)).body;
  const b = (await s.agent.post('/api/subscriptions').send(domain).expect(201)).body;
  await s.agent.patch(`/api/subscriptions/${b.id}`).send({ active: false }).expect(200);
  await s.agent.post(`/api/subscriptions/${a.id}/pay`).send({}).expect(201);
  const file = async (format: string, what: string) => ({ name: `coinio-${what}.${format}`, text: (await s.agent.get(`/api/export?format=${format}&what=${what}`).expect(200)).text });
  return { subsJson: await file('json', 'subscriptions'), paysJson: await file('json', 'payments'), subsCsv: await file('csv', 'subscriptions'), paysCsv: await file('csv', 'payments') };
}

const pick = (s: Record<string, unknown>) => ({
  name: s.name, domain: s.domain, amountMinor: s.amountMinor, currency: s.currency, cycle: s.cycle, intervalCount: s.intervalCount, nextDue: s.nextDue,
  autoPay: s.autoPay, paymentMethod: s.paymentMethod, category: s.category, notes: s.notes, reminderOffsets: s.reminderOffsets, active: s.active,
});

describe('importing Coinio files', () => {
  it('previews, then restores subscriptions and payment history from the JSON exports', async () => {
    const files = await source();
    const t = await login();
    const preview = (await t.agent.post('/api/import/coinio').send({ files: [files.subsJson, files.paysJson], dryRun: true }).expect(200)).body;
    expect(preview).toMatchObject({ created: 0, payments: 1 });
    expect(preview.items.map((i: { name: string }) => i.name)).toEqual([netflix.name, domain.name]);
    expect((await t.agent.get('/api/subscriptions?includeInactive=true')).body).toHaveLength(0);

    const done = (await t.agent.post('/api/import/coinio').send({ files: [files.paysJson, files.subsJson], dryRun: false }).expect(200)).body;
    expect(done).toMatchObject({ created: 2, payments: 1 });
    const subs = (await t.agent.get('/api/subscriptions?includeInactive=true')).body as Record<string, unknown>[];
    expect(subs.map(pick)).toEqual([
      pick({ ...netflix, active: true, nextDue: '2027-01-05' }),
      pick({ ...domain, domain: null, paymentMethod: null, category: null, notes: null, reminderOffsets: null, active: false }),
    ]);
    const pays = (await t.agent.get('/api/payments')).body;
    expect(pays).toHaveLength(1);
    expect(pays[0]).toMatchObject({ subscriptionId: subs[0]!.id, dueDate: '2026-12-05', amountMinor: 22999, currency: 'TRY', status: 'paid' });
  });

  it('reads the CSV exports too', async () => {
    const files = await source();
    const t = await login();
    const done = (await t.agent.post('/api/import/coinio').send({ files: [files.subsCsv, files.paysCsv], dryRun: false }).expect(200)).body;
    expect(done).toMatchObject({ created: 2, payments: 1 });
    const subs = (await t.agent.get('/api/subscriptions?includeInactive=true')).body as Record<string, unknown>[];
    expect(subs.map((s) => [s.name, s.amountMinor, s.notes, s.reminderOffsets, s.active])).toEqual([
      [netflix.name, 22999, netflix.notes, [3, 1], true],
      [domain.name, 2000, null, null, false],
    ]);
  });

  it('reads the hosted version\'s "download my data" file', async () => {
    const files = await source();
    const full = {
      account: { email: 'a@example.com' },
      settings: { baseCurrency: 'TRY' },
      subscriptions: JSON.parse(files.subsJson.text),
      payments: JSON.parse(files.paysJson.text),
    };
    const t = await login();
    const done = (await t.agent.post('/api/import/coinio').send({ files: [{ name: 'coinio-export-2026-11-22.json', text: JSON.stringify(full) }], dryRun: false }).expect(200)).body;
    expect(done).toMatchObject({ created: 2, payments: 1 });
  });

  it('skips subscriptions that already exist, so importing twice adds nothing', async () => {
    const files = await source();
    const t = await login();
    await t.agent.post('/api/import/coinio').send({ files: [files.subsJson, files.paysJson], dryRun: false }).expect(200);
    const again = (await t.agent.post('/api/import/coinio').send({ files: [files.subsJson, files.paysJson], dryRun: false }).expect(200)).body;
    expect(again).toMatchObject({ created: 0, payments: 0 });
    expect(again.warnings.join(' ')).toContain('already exists');
    expect((await t.agent.get('/api/subscriptions?includeInactive=true')).body).toHaveLength(2);
  });

  it('explains files it cannot use', async () => {
    const files = await source();
    const t = await login();
    const paysOnly = (await t.agent.post('/api/import/coinio').send({ files: [files.paysJson], dryRun: true }).expect(200)).body;
    expect(paysOnly.items).toEqual([]);
    expect(paysOnly.warnings.join(' ')).toContain('subscriptions file');
    await t.agent.post('/api/import/coinio').send({ files: [{ name: 'x.json', text: '[{"foo":1}]' }], dryRun: true }).expect(422);
    await t.agent.post('/api/import/coinio').send({ files: [{ name: 'x.json', text: 'not json' }], dryRun: true }).expect(422);
  });
});
