import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { VERSION } from '../src/shared/brand.js';
import { sql } from 'drizzle-orm';
import { openDb } from '../src/server/db/client.js';
import { makeTestApp } from './helpers.js';

describe('health', () => {
  it('GET /api/health returns ok and version', async () => {
    const { app } = makeTestApp();
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true, version: VERSION });
  });
});

describe('openDb', () => {
  it('creates all tables on :memory:', () => {
    const db = openDb(':memory:');
    const rows = db.all<{ name: string }>(
      sql`select name from sqlite_master where type = 'table' and name not like '\\_\\_%' escape '\\' and name not like 'sqlite\\_%' escape '\\'`,
    );
    const names = rows.map((r) => r.name).sort();
    expect(names).toEqual(
      [
        'api_keys', 'fx_rates', 'instance_settings', 'notification_channels', 'notification_log', 'oauth_clients', 'oauth_codes', 'oauth_tokens',
        'payments', 'sessions', 'settings', 'subscriptions', 'users',
      ].sort(),
    );
  });
});

describe('public URL over plain http', () => {
  it('starts without OAuth instead of crashing', async () => {
    const { app } = makeTestApp({ config: { publicUrl: 'http://192.168.1.20:8080' } });
    expect((await request(app).get('/api/health')).status).toBe(200);
    expect((await request(app).get('/.well-known/oauth-authorization-server')).status).toBe(404);
  });

  it('keeps OAuth on https and on localhost', async () => {
    for (const publicUrl of ['https://subs.example.com', 'http://localhost:8080']) {
      const { app } = makeTestApp({ config: { publicUrl } });
      expect((await request(app).get('/.well-known/oauth-authorization-server')).status).toBe(200);
    }
  });
});
