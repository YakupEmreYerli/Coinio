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
  /** Called after a user signs in with a built-in auth method. */
  onSignIn?(ctx: ServiceCtx, userId: number, method: 'password' | 'passkey'): void;
  /** Return false to prevent removing the passkey (e.g. when it is the user's last sign-in method). */
  canRemovePasskey?(ctx: ServiceCtx, userId: number, remainingPasskeys: number): boolean;
  /** Set false to require normal Cloud signup/login before accepting a household invite. */
  allowInviteSignup?: boolean;
  /**
   * The server's own mailer: enables the "account" notification channel, which mails the user's address
   * without any SMTP settings. `send` may throw an error with `transient: true` to have it retried.
   */
  mailer?: PluginMailer;
};

export type PluginMailer = {
  address(ctx: ServiceCtx, userId: number): string | null;
  send(ctx: ServiceCtx, userId: number, msg: { subject: string; text: string; html: string }): Promise<void>;
};

/** The first plugin mailer, if any. */
export function pluginMailer(ctx: ServiceCtx): PluginMailer | null {
  return (ctx.plugins ?? []).find((p) => p.mailer)?.mailer ?? null;
}

/** Whether every plugin lets this user in. */
export function userAllowed(ctx: ServiceCtx, userId: number): boolean {
  return (ctx.plugins ?? []).every((p) => p.allowUser?.(ctx, userId) ?? true);
}

/** Whether invited users may create an account directly from an invite link. */
export function inviteSignupAllowed(plugins?: CoinioPlugin[]): boolean {
  return (plugins ?? []).every((p) => p.allowInviteSignup !== false);
}
