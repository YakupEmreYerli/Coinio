import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb } from './db/client.js';
import { startScheduler } from './scheduler.js';

const config = loadConfig();
mkdirSync(config.dataDir, { recursive: true });
const db = openDb(join(config.dataDir, 'coinio.db'), config.migrationsDir);
const app = createApp({ db, config });

startScheduler({ db, config, fetch, now: () => new Date() });

app.listen(config.port, () => {
  console.log(`listening on :${config.port}`);
});
