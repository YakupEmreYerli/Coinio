import { readFileSync } from 'node:fs';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { subscriptions, users } from '../src/server/db/schema.js';
import type { ServiceCtx } from '../src/server/services/context.js';
import { importWallos, parseWallosExport } from '../src/server/services/wallosImport.js';
import { makeTestApp } from './helpers.js';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/wallos-export.json', import.meta.url), 'utf8'));

const noNetwork = (async () => new Response(null, { status: 404 })) as typeof fetch;

const row = (over: Record<string, unknown> = {}) => ({
  Name: 'X', 'Payment Cycle': 'Monthly', 'Next Payment': '2026-12-01', Renewal: 'Automatic', Price: '₺10.00', Active: 'Yes', ...over,
});
const parseOne = (over: Record<string, unknown>) => parseWallosExport([row(over)]);

function setup() {
  const t = makeTestApp({ fetch: noNetwork });
  const ctx: ServiceCtx = { db: t.db, config: t.config, fetch: noNetwork, now: () => t.clock.now };
  const user = t.db.insert(users).values({ username: 'y', passwordHash: 'x', createdAt: '2026-11-18T09:00:00Z' }).returning().get();
  return { ...t, ctx, user };
}

describe('parseWallosExport', () => {
  it('reads 8 importable records from the sample export', () => {
    const { items, warnings } = parseWallosExport(fixture);
    expect(items).toHaveLength(8);
    expect(items[1]).toMatchObject({ name: 'Spotify Premium', amountMinor: 18999, currency: 'TRY', cycle: 'monthly', intervalCount: 1, nextDue: '2026-12-07', autoPay: true, active: true, domain: 'spotify.com' });
    expect(items[2]!.domain).toBe('www.dropbox.com');
    expect(items[5]).toMatchObject({ name: 'VPS', autoPay: false, domain: 'panel.example-host.com' });
    expect(items[6]!.domain).toBeNull();
    expect(items[4]!.active).toBe(false);
    expect(items[0]).toMatchObject({ category: 'AI', paymentMethod: 'Credit Card', notes: 'Team plan' });
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('maps a yearly record to cycle yearly', () => {
    const yt = parseWallosExport(fixture).items.find((i) => i.name === 'Patreon membership')!;
    expect(yt).toMatchObject({ cycle: 'yearly', intervalCount: 1, amountMinor: 12000 });
  });

  it('maps "Every N <unit>" cycles', () => {
    expect(parseOne({ 'Payment Cycle': 'Every 3 Months' }).items[0]).toMatchObject({ cycle: 'monthly', intervalCount: 3 });
    expect(parseOne({ 'Payment Cycle': 'Every 2 Years' }).items[0]).toMatchObject({ cycle: 'yearly', intervalCount: 2 });
    expect(parseOne({ 'Payment Cycle': 'Weekly' }).items[0]).toMatchObject({ cycle: 'weekly', intervalCount: 1 });
    expect(parseOne({ 'Payment Cycle': 'Every 14 Days' }).items[0]).toMatchObject({ cycle: 'weekly', intervalCount: 2 });
  });

  it('skips Daily records with a warning', () => {
    const r = parseOne({ 'Payment Cycle': 'Daily' });
    expect(r.items).toHaveLength(0);
    expect(r.warnings.join('\n')).toMatch(/Daily/);
    expect(parseOne({ 'Payment Cycle': 'Every 10 Days' }).items).toHaveLength(0);
  });

  it('warns about unrecognized fields once per field without stopping the import', () => {
    const r = parseWallosExport([row({ Mystery: 1 }), row({ Mystery: 2, Other: 3 })]);
    expect(r.items).toHaveLength(2);
    expect(r.warnings.filter((w) => w.includes('Mystery'))).toHaveLength(1);
    expect(r.warnings.filter((w) => w.includes('Other'))).toHaveLength(1);
  });

  it('reads $9.99 as USD and warns it is ambiguous', () => {
    const r = parseOne({ Price: '$9.99' });
    expect(r.items[0]).toMatchObject({ currency: 'USD', amountMinor: 999 });
    expect(r.warnings.join('\n')).toMatch(/\$/);
  });

  it('maps currency symbols and codes', () => {
    expect(parseOne({ Price: '€5.00' }).items[0]!.currency).toBe('EUR');
    expect(parseOne({ Price: '£5.00' }).items[0]!.currency).toBe('GBP');
    expect(parseOne({ Price: 'CHF 5.00' }).items[0]!.currency).toBe('CHF');
    expect(parseOne({ Price: '₺10' }).warnings).toEqual([]);
  });

  it('reads yen prices as whole yen, warning that ¥ could be CNY', () => {
    const r = parseOne({ Price: '¥1500' });
    expect(r.items[0]).toMatchObject({ currency: 'JPY', amountMinor: 1500 });
    expect(r.warnings.join('\n')).toMatch(/¥/);
    expect(parseOne({ Price: '¥1500.00' }).items[0]!.amountMinor).toBe(1500);
    expect(parseOne({ Price: 'JPY 1,490' }).items[0]).toMatchObject({ currency: 'JPY', amountMinor: 1490 });
    expect(parseOne({ Price: '₩17000' }).items[0]).toMatchObject({ currency: 'KRW', amountMinor: 17000 });
    const bad = parseOne({ Price: '¥1500.5' });
    expect(bad.items).toHaveLength(0);
    expect(bad.warnings.join('\n')).toMatch(/0 decimals for JPY/);
  });

  it('skips rows with an unknown currency symbol', () => {
    const r = parseOne({ Price: '¤5.00' });
    expect(r.items).toHaveLength(0);
    expect(r.warnings.join('\n')).toMatch(/currency/i);
  });

  it.each([
    ['₺999.99', 99999, false],
    ['999,99 ₺', 99999, false],
    ['₺1.234,56', 123456, false],
    ['1,234.56 ₺', 123456, false],
    ['₺1,234', 123400, true],
    ['₺1.234', 123400, true],
    ['₺1.234.567', 123456700, false],
    ['₺0.125', null, false],
    ['₺12,5', 1250, false],
    ['₺1234.5', 123450, false],
    ['₺0', 0, false],
    ['₺abc', null, false],
    ['', null, false],
  ])('parses price %j', (price, minor, ambiguous) => {
    const r = parseOne({ Price: price });
    if (minor === null) {
      expect(r.items).toHaveLength(0);
      expect(r.warnings.length).toBeGreaterThan(0);
    } else {
      expect(r.items[0]!.amountMinor).toBe(minor);
      expect(r.warnings.some((w) => /ambiguous/i.test(w))).toBe(ambiguous);
    }
  });

  it('skips invalid rows with a warning and keeps the valid ones', () => {
    const r = parseWallosExport([row({ 'Next Payment': 'soon' }), row({ Name: '' }), 'junk', row({ Name: 'Good' })]);
    expect(r.items.map((i) => i.name)).toEqual(['Good']);
    expect(r.warnings.length).toBe(3);
  });

  it('treats Manual renewal as autoPay false and Active No as inactive', () => {
    expect(parseOne({ Renewal: 'Manual', Active: 'No' }).items[0]).toMatchObject({ autoPay: false, active: false });
  });

  it('reduces URLs to a bare hostname or null', () => {
    expect(parseOne({ URL: 'https://www.netflix.com/browse?x=1' }).items[0]!.domain).toBe('www.netflix.com');
    expect(parseOne({ URL: 'Netflix.com/tr' }).items[0]!.domain).toBe('netflix.com');
    expect(parseOne({ URL: 'not a url' }).items[0]!.domain).toBeNull();
    expect(parseOne({ URL: '' }).items[0]!.domain).toBeNull();
    expect(parseOne({}).items[0]!.domain).toBeNull();
  });

  it('accepts a bare array and rejects other shapes', () => {
    expect(parseWallosExport([row()]).items).toHaveLength(1);
    expect(() => parseWallosExport({ success: true })).toThrow();
    expect(() => parseWallosExport('nope')).toThrow();
  });
});

describe('importWallos', () => {
  it('dryRun reports items and warnings but writes nothing', () => {
    const { ctx, user, db } = setup();
    const r = importWallos(ctx, user.id, fixture, true);
    expect(r.created).toBe(0);
    expect(r.items).toHaveLength(8);
    expect(db.select().from(subscriptions).all()).toHaveLength(0);
  });

  it('creates all valid records, keeps inactive ones inactive', () => {
    const { ctx, user, db } = setup();
    const r = importWallos(ctx, user.id, fixture, false);
    expect(r.created).toBe(8);
    const rows = db.select().from(subscriptions).all();
    expect(rows).toHaveLength(8);
    expect(rows.find((s) => s.name === 'Amazon Prime')!.active).toBe(false);
    expect(rows.find((s) => s.name === 'Figma Professional')).toMatchObject({ currency: 'USD', amountMinor: 4500, anchorDay: 3 });
  });

  it('warns about manual rows whose next payment is in the past (not about auto-pay or inactive ones)', () => {
    const { ctx, user } = setup();
    const w = importWallos(ctx, user.id, [row({ Name: 'Late', Renewal: 'Manual', 'Next Payment': '2026-11-10' }), row({ Name: 'Auto', 'Next Payment': '2026-11-10' }), row({ Name: 'Off', Renewal: 'Manual', Active: 'No', 'Next Payment': '2026-11-10' })], true).warnings;
    expect(w.filter((x) => /past/i.test(x))).toHaveLength(1);
    expect(w.join('\n')).toMatch(/Late/);
    expect(importWallos(ctx, user.id, fixture, true).warnings.join('\n')).toMatch(/VPS.*past/);
  });

  it('rolls back everything if an insert fails', () => {
    const { ctx, user, db } = setup();
    expect(() => importWallos(ctx, 99999, [row({ Name: 'A' }), row({ Name: 'B' })], false)).toThrow();
    expect(db.select().from(subscriptions).all()).toHaveLength(0);
  });
});

describe('POST /api/import/wallos', () => {
  async function login() {
    const t = makeTestApp({ fetch: noNetwork });
    const agent = request.agent(t.app);
    await agent.post('/api/auth/setup').send({ username: 'owner', password: 'correct horse battery' });
    return { ...t, agent };
  }

  it('requires a session', async () => {
    const { app } = makeTestApp();
    expect((await request(app).post('/api/import/wallos').send({ data: fixture, dryRun: true })).status).toBe(401);
  });

  it('dry run then real import', async () => {
    const { agent, db } = await login();
    const dry = await agent.post('/api/import/wallos').send({ data: fixture, dryRun: true });
    expect(dry.status).toBe(200);
    expect(dry.body).toMatchObject({ created: 0 });
    expect(dry.body.items).toHaveLength(8);
    expect(db.select().from(subscriptions).all()).toHaveLength(0);
    const real = await agent.post('/api/import/wallos').send({ data: fixture, dryRun: false });
    expect(real.body.created).toBe(8);
    expect((await agent.get('/api/subscriptions?includeInactive=true')).body).toHaveLength(8);
  });

  it('rejects malformed bodies with 400', async () => {
    const { agent } = await login();
    expect((await agent.post('/api/import/wallos').send({ data: { nope: 1 }, dryRun: true })).status).toBe(400);
    expect((await agent.post('/api/import/wallos').send({ data: fixture })).status).toBe(400);
  });

  it('accepts bodies above the default 100 KB up to 1 MB, and refuses larger', async () => {
    const { agent } = await login();
    const big = (kb: number) => ({ data: [row({ Pad: 'x'.repeat(kb * 1024) })], dryRun: true });
    expect((await agent.post('/api/import/wallos').send(big(300))).status).toBe(200);
    expect((await agent.post('/api/import/wallos').send(big(1100))).status).toBe(413);
  });
});
