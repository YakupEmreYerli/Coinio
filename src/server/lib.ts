// Entry point for embedding the server (custom builds that add plugins).
export { createApp, type AppDeps } from './app.js';
export { startScheduler } from './scheduler.js';
export { loadConfig, type Config } from './config.js';
export { openDb, type Db } from './db/client.js';
export { deleteUser } from './services/users.js';
export { userAllowed, type CoinioPlugin } from './plugins.js';
export type { ServiceCtx } from './services/context.js';
