import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { makeTestApp } from './helpers.js';

function webDir() {
  const dir = mkdtempSync(join(tmpdir(), 'coinio-web-'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>spa</title>');
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'assets', 'app.js'), 'console.log(1)');
  return dir;
}

describe('static web UI', () => {
  it('serves files and falls back to index.html for client routes', async () => {
    const { app } = makeTestApp({ config: { webDir: webDir() } });
    expect((await request(app).get('/assets/app.js')).text).toBe('console.log(1)');
    const res = await request(app).get('/login');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<title>spa</title>');
  });

  it('does not swallow server-owned paths', async () => {
    const { app } = makeTestApp({ config: { webDir: webDir() } });
    for (const path of ['/api/nope', '/oauth/nope', '/mcp/nope', '/logos/nope.png', '/.well-known/nope', '/token/x', '/revoke/x']) {
      const res = await request(app).get(path);
      expect(res.text, path).not.toContain('<title>spa</title>');
    }
    expect((await request(app).get('/.well-known/oauth-authorization-server')).body.issuer).toBeTruthy();
    expect((await request(app).get('/api/health')).body.ok).toBe(true);
  });

  it('serves nothing when the web build is absent', async () => {
    const { app } = makeTestApp({ config: { webDir: join(tmpdir(), 'coinio-missing-web') } });
    expect((await request(app).get('/login')).status).toBe(404);
  });
});
