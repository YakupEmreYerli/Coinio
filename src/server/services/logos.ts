import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { and, eq, ne } from 'drizzle-orm';
import { subscriptions } from '../db/schema.js';
import type { ServiceCtx } from './context.js';
import { fetchBestLogo } from './logoCandidates.js';

export const MAX_LOGO_BYTES = 512 * 1024;
export const LOGO_FILE_RE = /^[0-9a-f]{40}\.(png|jpg|webp|ico|svg)$/;

export type LogoExt = 'png' | 'jpg' | 'webp' | 'ico' | 'svg';

export const LOGO_MIME: Record<LogoExt, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  webp: 'image/webp',
  ico: 'image/x-icon',
  svg: 'image/svg+xml',
};

/** Detects the image type from magic bytes (SVG by text sniff). Never trusts a declared type. */
export function sniffLogoExt(buf: Buffer): LogoExt | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length >= 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'webp';
  if (buf.length >= 4 && buf[0] === 0 && buf[1] === 0 && buf[2] === 1 && buf[3] === 0) return 'ico';
  if (buf.subarray(0, 1024).toString('utf8').toLowerCase().includes('<svg')) return 'svg';
  return null;
}

export function writeLogoFile(dataDir: string, name: string, buf: Buffer): string {
  const dir = join(dataDir, 'logos');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), buf);
  return name;
}

/** Stores an uploaded logo under a random name; returns the file name. */
export function storeUploadedLogo(ctx: ServiceCtx, buf: Buffer, ext: LogoExt): string {
  return writeLogoFile(ctx.config.dataDir, `${randomBytes(20).toString('hex')}.${ext}`, buf);
}

export function deleteLogoFile(ctx: ServiceCtx, name: string | null): void {
  if (!name || !LOGO_FILE_RE.test(name)) return;
  try {
    unlinkSync(join(ctx.config.dataDir, 'logos', name));
  } catch {
    // already gone
  }
}

/** Points the subscription at a new logo file (or none) and removes the previous one. */
export function replaceLogo(ctx: ServiceCtx, subscriptionId: number, name: string | null) {
  const old = ctx.db.select({ p: subscriptions.logoPath }).from(subscriptions).where(eq(subscriptions.id, subscriptionId)).get();
  const row = ctx.db.update(subscriptions).set({ logoPath: name, updatedAt: ctx.now().toISOString() }).where(eq(subscriptions.id, subscriptionId)).returning().get();
  if (old?.p && old.p !== name) {
    // Fetched logos are named by domain hash and shared by subscriptions on the same domain.
    const stillUsed = ctx.db
      .select({ id: subscriptions.id })
      .from(subscriptions)
      .where(and(eq(subscriptions.logoPath, old.p), ne(subscriptions.id, subscriptionId)))
      .get();
    if (!stillUsed) deleteLogoFile(ctx, old.p);
  }
  return row;
}

export async function readCapped(res: Response, max: number): Promise<Buffer | null> {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > max) return null;
  if (!res.body) return null;
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
    total += chunk.byteLength;
    if (total > max) return null;
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** Downloads the site icon for a domain; returns the stored file name, or null on any failure. */
export async function fetchLogo(ctx: ServiceCtx, domain: string): Promise<string | null> {
  const res = await ctx.fetch(`https://icons.duckduckgo.com/ip3/${domain}.ico`, { signal: AbortSignal.timeout(8000), redirect: 'error' });
  if (!res.ok || !(res.headers.get('content-type') ?? '').toLowerCase().startsWith('image/')) return null;
  const buf = await readCapped(res, MAX_LOGO_BYTES);
  if (!buf) return null;
  const ext = sniffLogoExt(buf);
  if (!ext) return null;
  const hash = createHash('sha1').update(domain).digest('hex');
  return writeLogoFile(ctx.config.dataDir, `${hash}.${ext}`, buf);
}

const pendingLogoFetches = new Set<Promise<void>>();

/** Test hook: resolves once every background logo fetch has settled. */
export async function waitForLogoFetches(): Promise<void> {
  while (pendingLogoFetches.size > 0) await Promise.allSettled([...pendingLogoFetches]);
}

/** Fire-and-forget: fetches the logo for a subscription's new domain. Never throws. */
export function fetchLogoInBackground(ctx: ServiceCtx, subscriptionId: number, domain: string): void {
  const task: Promise<void> = (async () => {
    try {
      const name = await fetchBestLogo(ctx, domain);
      if (!name) return;
      const current = ctx.db.select({ d: subscriptions.domain }).from(subscriptions).where(eq(subscriptions.id, subscriptionId)).get();
      if (current?.d !== domain) return;
      replaceLogo(ctx, subscriptionId, name);
    } catch (err) {
      console.warn(`logo: fetch for ${domain} failed:`, err instanceof Error ? err.message : err);
    }
  })().finally(() => pendingLogoFetches.delete(task));
  pendingLogoFetches.add(task);
}
