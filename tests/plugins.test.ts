import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/server/app.js';
import type { CoinioPlugin } from '../src/server/plugins.js';
import { startScheduler } from '../src/server/scheduler.js';
import { createApiKey } from '../src/server/services/apiKeys.js';
import type { ServiceCtx } from '../src/server/services/context.js';
import { addUser, makeTestApp } from './helpers.js';

afterEach(() => vi.useRealTimers());

function appWith(plugins: CoinioPlugin[]) {
  const t = makeTestApp();
  const app = createApp({ db: t.db, config: t.config, now: () => t.clock.now, plugins });
  return { ...t, app };
}

describe('plugins', () => {
  it('lets an early route win over a built-in one, and adds routes after the API', async () => {
    const { app } = appWith([
      {
        name: 'test',
        early: (a) => a.post('/api/auth/setup', (_req, res) => void res.status(404).json({ error: 'not_found' })),
        routes: (a) => a.get('/api/extra', (_req, res) => void res.json({ ok: true })),
      },
    ]);
    await request(app).post('/api/auth/setup').send({ username: 'y', password: 'password-123456' }).expect(404);
    expect((await request(app).get('/api/extra').expect(200)).body).toEqual({ ok: true });
  });

  it('rejects sessions and API keys of a user a plugin does not allow', async () => {
    const t = appWith([{ name: 'test', allowUser: (_ctx, id) => id !== 2 }]);
    const a = addUser(t, 'a');
    const b = addUser(t, 'b');
    expect(b.id).toBe(2);
    await a.agent.get('/api/subscriptions').expect(200);
    expect((await b.agent.get('/api/subscriptions').expect(401)).body).toEqual({ error: 'account_unavailable' });
    const ctx: ServiceCtx = { db: t.db, config: t.config, fetch, now: () => t.clock.now };
    const { key } = createApiKey(ctx, b.id, 'k', 'read');
    await request(t.app).get('/api/widget').set('Authorization', `Bearer ${key}`).expect(401);
    await b.agent.get('/api/auth/state').expect(200);
  });

  it('runs onTick once per tick and keeps going when it throws', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const t = makeTestApp();
    const ctx: ServiceCtx = { db: t.db, config: t.config, fetch, now: () => t.clock.now };
    const ok = vi.fn();
    const bad = vi.fn(() => {
      throw new Error('boom');
    });
    const stop = startScheduler(ctx, { intervalMs: 1000, plugins: [{ name: 'bad', onTick: bad }, { name: 'ok', onTick: ok }] });
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(1000);
    stop();
    expect(bad).toHaveBeenCalledTimes(2);
    expect(ok).toHaveBeenCalledTimes(2);
  });
});
