import type express from 'express';
import type { ServiceCtx } from './services/context.js';

/** An extension of the server, given to `createApp` and `startScheduler`. Every hook is optional. */
export type CoinioPlugin = {
  name: string;
  /** Mounted before every built-in route, so a plugin route wins over a built-in one with the same path. */
  early?(app: express.Express, ctx: ServiceCtx): void;
  /** Mounted after the built-in API routes, before the web app fallback. */
  routes?(app: express.Express, ctx: ServiceCtx): void;
  /** Return false to reject an otherwise valid session, API key or OAuth token (a suspended account). */
  allowUser?(ctx: ServiceCtx, userId: number): boolean;
  /** Runs once per scheduler tick after the built-in steps; errors are logged, never thrown. */
  onTick?(ctx: ServiceCtx): Promise<void> | void;
  /** Called after the built-in rows of a user were deleted. */
  onUserDeleted?(ctx: ServiceCtx, userId: number): void;
};

/** Whether every plugin lets this user in. */
export function userAllowed(ctx: ServiceCtx, userId: number): boolean {
  return (ctx.plugins ?? []).every((p) => p.allowUser?.(ctx, userId) ?? true);
}
