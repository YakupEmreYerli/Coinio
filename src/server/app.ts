import { mcpAuthRouter } from '@modelcontextprotocol/sdk/server/auth/router.js';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import { VERSION } from '../shared/brand.js';
import { oauthUrlOf, type Config } from './config.js';
import type { Db } from './db/client.js';
import { authRouter } from './routes/auth.js';
import { exportRouter } from './routes/export.js';
import { importRouter } from './routes/import.js';
import { consentRouter } from './oauth/consent.js';
import { OAUTH_SCOPES, SqliteOAuthProvider } from './oauth/provider.js';
import { keysRouter, oauthClientsRouter } from './routes/keys.js';
import { logosRouter } from './routes/logos.js';
import { mcpRouter } from './routes/mcp.js';
import { notificationsRouter } from './routes/notifications.js';
import { reportsRouter } from './routes/reports.js';
import { appearanceRouter, settingsRouter } from './routes/settings.js';
import { onboardingRouter } from './routes/onboarding.js';
import { subscriptionsRouter } from './routes/subscriptions.js';
import { widgetRouter } from './routes/widget.js';
import type { LookupFn, ServiceCtx } from './services/context.js';
import { seedTelegramFromEnv } from './services/notify/channels.js';
import { accountGuard } from './auth/accountGuard.js';
import type { CoinioPlugin } from './plugins.js';

export type AppDeps = {
  db: Db;
  config: Config;
  now?: () => Date;
  lookup?: LookupFn;
  fetch?: typeof fetch;
  plugins?: CoinioPlugin[];
};

const SERVER_PATHS = /^\/(api|oauth|mcp|logos|\.well-known|authorize|token|register|revoke)(\/|$)/;

export function createApp(deps: AppDeps): express.Express {
  const app = express();
  app.set('trust proxy', 1);

  const now = deps.now ?? (() => new Date());
  const plugins = deps.plugins ?? [];
  const ctx: ServiceCtx = { db: deps.db, config: deps.config, fetch: deps.fetch ?? fetch, now, lookup: deps.lookup, plugins };
  seedTelegramFromEnv(ctx);

  // Before every route that answers (including the two below with their own body parsers).
  if (plugins.some((p) => p.allowUser)) app.use(cookieParser(), accountGuard(ctx));

  // Wallos exports can exceed the default 100 KB body limit; mounted before the global parser, which would reject them.
  app.use('/api/import', cookieParser(), express.json({ limit: '8mb' }), importRouter(ctx));

  // Custom CSS and HTML cards can be large too.
  app.use('/api/appearance', cookieParser(), express.json({ limit: '2mb' }), appearanceRouter(ctx));

  app.use(express.json());
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, version: VERSION });
  });

  for (const plugin of plugins) plugin.early?.(app, ctx);

  const publicUrl = oauthUrlOf(deps.config.publicUrl);
  if (publicUrl) {
    const provider = new SqliteOAuthProvider(ctx);
    app.use(mcpAuthRouter({
      provider,
      issuerUrl: new URL(publicUrl),
      resourceServerUrl: new URL('/mcp', publicUrl),
      scopesSupported: [...OAUTH_SCOPES],
      // Secrets never expire on their own: refresh tokens live 90 days and disconnecting a client deletes it.
      clientRegistrationOptions: { clientSecretExpirySeconds: 0 },
    }));
    app.use(consentRouter(ctx, provider));
  } else if (deps.config.publicUrl) {
    console.warn('COINIO_PUBLIC_URL is not https: OAuth for remote MCP clients is disabled, API keys still work.');
  } else {
    console.warn('COINIO_PUBLIC_URL is not set: OAuth for remote MCP clients is disabled, API keys still work.');
  }

  app.use('/api/auth', authRouter({ db: deps.db, config: deps.config, now, plugins }));
  app.use('/api/settings', settingsRouter(ctx));
  app.use('/api/notifications', notificationsRouter(ctx));
  app.use('/api/onboarding', onboardingRouter(ctx));
  app.use('/api/keys', keysRouter(ctx));
  app.use('/api/oauth/clients', oauthClientsRouter(ctx));
  app.use('/api/widget', widgetRouter(ctx));
  app.use('/api/export', exportRouter(ctx));
  app.use('/api/reports', reportsRouter(ctx));
  app.use(logosRouter(ctx));
  app.use('/api', subscriptionsRouter(ctx));
  app.use('/mcp', mcpRouter(ctx));
  for (const plugin of plugins) plugin.routes?.(app, ctx);

  const indexHtml = join(deps.config.webDir, 'index.html');
  if (existsSync(indexHtml)) {
    app.use(express.static(deps.config.webDir));
    // SPA fallback: never for server-owned paths, so a missing API route or OAuth page stays a 404.
    app.use((req, res, next) => {
      if ((req.method !== 'GET' && req.method !== 'HEAD') || SERVER_PATHS.test(req.path)) {
        next();
        return;
      }
      res.sendFile(indexHtml);
    });
  }

  return app;
}
