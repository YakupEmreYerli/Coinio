import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { addUser, makeTestApp } from './helpers.js';

const sub = (name: string) => ({ name, amountMinor: 1000, currency: 'USD', cycle: 'monthly', intervalCount: 1, nextDue: '2026-12-01' });
const slack = { type: 'slack', name: 'Slack', config: {}, secrets: { webhookUrl: 'https://hooks.slack.test/x' } };

describe('per-user limits', () => {
  it('stops a user at the subscription limit, per user', async () => {
    const t = makeTestApp({ config: { limits: { maxSubscriptions: 2, maxChannels: null, maxApiKeys: null } } });
    const a = addUser(t, 'a');
    await a.agent.post('/api/subscriptions').send(sub('1')).expect(201);
    await a.agent.post('/api/subscriptions').send(sub('2')).expect(201);
    const res = await a.agent.post('/api/subscriptions').send(sub('3')).expect(409);
    expect(res.body).toEqual({ error: 'limit_reached', resource: 'subscriptions', limit: 2 });
    const b = addUser(t, 'b');
    await b.agent.post('/api/subscriptions').send(sub('1')).expect(201);
  });

  it('limits channels and API keys', async () => {
    const t = makeTestApp({ config: { limits: { maxSubscriptions: null, maxChannels: 1, maxApiKeys: 1 } } });
    const a = addUser(t, 'a');
    await a.agent.post('/api/notifications/channels').send(slack).expect(201);
    expect((await a.agent.post('/api/notifications/channels').send(slack).expect(409)).body).toEqual({ error: 'limit_reached', resource: 'channels', limit: 1 });
    await a.agent.post('/api/keys').send({ name: 'k', scope: 'read' }).expect(201);
    expect((await a.agent.post('/api/keys').send({ name: 'k2', scope: 'read' }).expect(409)).body).toEqual({ error: 'limit_reached', resource: 'apiKeys', limit: 1 });
  });

  it('stops a Wallos import at the limit and says so', async () => {
    const t = makeTestApp({ config: { limits: { maxSubscriptions: 1, maxChannels: null, maxApiKeys: null } } });
    const a = addUser(t, 'a');
    const data = JSON.parse(readFileSync(join(__dirname, 'fixtures/wallos-export.json'), 'utf8'));
    const res = await a.agent.post('/api/import/wallos').send({ data, dryRun: false }).expect(200);
    expect(res.body.created).toBe(1);
    expect(res.body.warnings).toContain('limit_reached');
  });

  it('has no limit by default', async () => {
    const t = makeTestApp();
    const a = addUser(t, 'a');
    for (let i = 0; i < 30; i++) await a.agent.post('/api/subscriptions').send(sub(String(i))).expect(201);
  });
});
