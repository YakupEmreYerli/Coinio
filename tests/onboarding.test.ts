import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { users } from '../src/server/db/schema.js';
import { SAMPLE_SUBSCRIPTIONS } from '../src/shared/sampleData.js';
import { makeTestApp } from './helpers.js';

async function login(t = makeTestApp()) {
  const agent = request.agent(t.app);
  await agent.post('/api/auth/setup').send({ username: 'yakup', password: 'correct horse battery' });
  return { ...t, agent };
}

describe('onboarding', () => {
  it('fresh install is not onboarded', async () => {
    const { agent } = await login();
    expect((await agent.get('/api/onboarding')).body).toEqual({ completed: false, hasSamples: false });
  });

  it('requires a session', async () => {
    const { app } = makeTestApp();
    expect((await request(app).get('/api/onboarding')).status).toBe(401);
  });

  it('complete marks onboarded', async () => {
    const { agent } = await login();
    expect((await agent.post('/api/onboarding/complete')).status).toBe(204);
    expect((await agent.get('/api/onboarding')).body.completed).toBe(true);
  });

  it('samples are created once', async () => {
    const { agent } = await login();
    expect((await agent.post('/api/onboarding/samples')).status).toBe(201);
    await agent.post('/api/onboarding/samples');
    expect((await agent.get('/api/subscriptions')).body).toHaveLength(SAMPLE_SUBSCRIPTIONS.length);
    expect((await agent.get('/api/onboarding')).body.hasSamples).toBe(true);
  });

  it('clearing samples keeps user subscriptions', async () => {
    const { agent } = await login();
    await agent.post('/api/onboarding/samples');
    const mine = (await agent.post('/api/subscriptions').send({ name: 'Mine', amountMinor: 100, currency: 'TRY', cycle: 'monthly', intervalCount: 1, nextDue: '2026-12-01' })).body;
    expect((await agent.delete('/api/onboarding/samples')).status).toBe(204);
    const left = (await agent.get('/api/subscriptions?includeInactive=true')).body as { id: number }[];
    expect(left.map((s) => s.id)).toEqual([mine.id]);
    expect((await agent.get('/api/onboarding')).body.hasSamples).toBe(false);
  });

  it('an install that already has subscriptions counts as onboarded even if the account is new', async () => {
    const { agent } = await login();
    await agent.post('/api/subscriptions').send({ name: 'Mine', amountMinor: 100, currency: 'TRY', cycle: 'monthly', intervalCount: 1, nextDue: '2026-12-01' });
    expect((await agent.get('/api/onboarding')).body.completed).toBe(true);
  });

  it('existing installs are treated as onboarded', async () => {
    const t = makeTestApp();
    const { agent, db } = await login(t);
    await agent.post('/api/subscriptions').send({ name: 'Old', amountMinor: 100, currency: 'TRY', cycle: 'monthly', intervalCount: 1, nextDue: '2026-12-01' });
    db.update(users).set({ createdAt: '2026-11-01T00:00:00Z' }).run();
    expect((await agent.get('/api/onboarding')).body.completed).toBe(true);
  });

  it('samples are priced in the main currency so totals work before any rate is fetched', async () => {
    const { agent } = await login();
    await agent.post('/api/onboarding/samples');
    const subs = (await agent.get('/api/subscriptions')).body as { currency: string; amountMinor: number }[];
    expect(new Set(subs.map((s) => s.currency))).toEqual(new Set(['TRY']));
    expect((await agent.get('/api/summary')).body.unconvertible).toEqual([]);
  });
});
