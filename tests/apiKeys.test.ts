import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { makeTestApp } from './helpers.js';

async function setup() {
  const t = makeTestApp();
  const agent = request.agent(t.app);
  await agent.post('/api/auth/setup').send({ username: 'yakup', password: 'correct horse battery' });
  return { ...t, agent };
}

describe('api keys', () => {
  it('creates a key once and lists only the prefix', async () => {
    const { agent } = await setup();
    const created = await agent.post('/api/keys').send({ name: 'phone', scope: 'read' });
    expect(created.status).toBe(201);
    expect(created.body.key).toMatch(/^coi_read_[A-Za-z0-9_-]{43}$/);
    expect(created.body.prefix).toBe(created.body.key.slice(0, 12));
    const list = await agent.get('/api/keys');
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain(created.body.key);
    expect(list.body[0]).toMatchObject({ id: created.body.id, name: 'phone', scope: 'read', prefix: created.body.prefix, lastUsedAt: null });
  });

  it('requires a session and validates input', async () => {
    const { app, agent } = await setup();
    expect((await request(app).get('/api/keys')).status).toBe(401);
    expect((await agent.post('/api/keys').send({ name: '', scope: 'read' })).status).toBe(400);
    expect((await agent.post('/api/keys').send({ name: 'x', scope: 'admin' })).status).toBe(400);
  });

  it('revoked key gives 401 invalid_token and disappears from the list', async () => {
    const { app, agent } = await setup();
    const { body } = await agent.post('/api/keys').send({ name: 'k', scope: 'read' });
    expect((await request(app).get('/api/widget').set('Authorization', `Bearer ${body.key}`)).status).toBe(200);
    expect((await agent.delete(`/api/keys/${body.id}`)).status).toBe(204);
    const res = await request(app).get('/api/widget').set('Authorization', `Bearer ${body.key}`);
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'invalid_token' });
    expect((await agent.get('/api/keys')).body).toEqual([]);
    expect((await agent.delete(`/api/keys/${body.id}`)).status).toBe(404);
  });

  it('updates last_used_at on use', async () => {
    const { app, agent } = await setup();
    const { body } = await agent.post('/api/keys').send({ name: 'k', scope: 'full' });
    await request(app).get('/api/widget').set('Authorization', `Bearer ${body.key}`);
    expect((await agent.get('/api/keys')).body[0].lastUsedAt).toBe('2026-11-18T09:00:00.000Z');
  });
});
