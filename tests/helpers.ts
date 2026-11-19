import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/server/app.js';
import { loadConfig, type Config } from '../src/server/config.js';
import { openDb } from '../src/server/db/client.js';
import type { LookupFn } from '../src/server/services/context.js';

export type TestClock = { now: Date; set(d: Date | string): void };

/** Every host resolves to a public address unless a test passes its own resolver. */
export const publicLookup: LookupFn = async () => [{ address: '93.184.216.34', family: 4 }];

export function makeTestApp(opts: { config?: Partial<Config>; now?: Date; fetch?: typeof fetch; lookup?: LookupFn } = {}) {
  const db = openDb(':memory:');
  const config: Config = {
    ...loadConfig({}),
    dataDir: mkdtempSync(join(tmpdir(), 'coinio-test-')),
    publicUrl: 'http://localhost:4660',
    ...opts.config,
  };
  const clock: TestClock = {
    now: opts.now ?? new Date('2026-11-18T09:00:00Z'),
    set(d) {
      this.now = new Date(d);
    },
  };
  const app = createApp({ db, config, now: () => clock.now, fetch: opts.fetch, lookup: opts.lookup ?? publicLookup });
  return { app, db, clock, config };
}
