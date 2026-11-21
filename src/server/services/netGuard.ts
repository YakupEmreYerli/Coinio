// Keeps requests to user-supplied addresses (webhooks, notification servers, SMTP hosts, sites) off the
// server's own network: loopback, private ranges, link-local and cloud metadata addresses.
import { lookup as dnsLookup } from 'node:dns';
import { lookup as dnsLookupAsync } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Agent, fetch as undiciFetch } from 'undici';
import type { LookupFn, ServiceCtx } from './context.js';

export class BlockedAddressError extends Error {
  constructor(host: string) {
    super(`Blocked: ${host} is on a private network`);
  }
}

function v4Private(ip: string): boolean {
  const [a, b, c] = ip.split('.').map(Number) as [number, number, number];
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

/** The IPv4 address embedded in an IPv4-mapped (::ffff:a.b.c.d or ::ffff:hhhh:hhhh) or NAT64 (64:ff9b::/96) address. */
function embeddedV4(v6: string): string | null {
  const dotted = v6.match(/^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) return dotted[1]!;
  const hex = v6.match(/^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (!hex) return null;
  const hi = parseInt(hex[1]!, 16);
  const lo = parseInt(hex[2]!, 16);
  return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
}

export function isPrivateAddress(address: string): boolean {
  const ip = address.toLowerCase().replace(/^\[|\]$/g, '');
  if (isIP(ip) === 4) return v4Private(ip);
  if (isIP(ip) !== 6) return true;
  const v4 = embeddedV4(ip);
  if (v4) return v4Private(v4);
  return ip === '::' || ip === '::1' || /^f[cd]/.test(ip) || /^fe[89ab]/.test(ip) || /^ff/.test(ip);
}

const systemLookup: LookupFn = (host) => dnsLookupAsync(host, { all: true });

/** Only dotted names that resolve exclusively to public addresses (IP literals are refused). */
export async function isPublicHost(ctx: ServiceCtx, host: string): Promise<boolean> {
  if (!host.includes('.') || isIP(host) !== 0) return false;
  return resolvesPublic(ctx, host);
}

async function resolvesPublic(ctx: ServiceCtx, host: string): Promise<boolean> {
  const bare = host.replace(/^\[|\]$/g, '');
  if (isIP(bare) !== 0) return !isPrivateAddress(bare);
  try {
    const addrs = await (ctx.lookup ?? systemLookup)(bare);
    return addrs.length > 0 && addrs.every((a) => !isPrivateAddress(a.address));
  } catch {
    return false;
  }
}

/** Throws unless the URL is http(s) to a host whose every address is public. */
export async function assertPublicUrl(ctx: ServiceCtx, url: string): Promise<URL> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BlockedAddressError(url);
  }
  if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || !(await resolvesPublic(ctx, parsed.hostname))) {
    throw new BlockedAddressError(parsed.hostname || url);
  }
  return parsed;
}

const MAX_REDIRECTS = 3;
let pinnedAgent: Agent | undefined;

/**
 * Checks the address again at connect time, so a name that resolved to a public address during the
 * check cannot switch to a private one for the real connection (DNS rebinding).
 */
function agent(): Agent {
  pinnedAgent ??= new Agent({
    connect: {
      lookup: (hostname, options, callback) => {
        dnsLookup(hostname, { ...options, all: true }, (err, addrs) => {
          if (err) return callback(err, [] as never);
          if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) return callback(new BlockedAddressError(hostname), [] as never);
          if ((options as { all?: boolean }).all) return callback(null, addrs as never);
          callback(null, addrs[0]!.address as never, addrs[0]!.family as never);
        });
      },
    },
  });
  return pinnedAgent;
}

/**
 * `fetch` for user-supplied addresses. With the guard off it is plain `ctx.fetch`; with it on, every hop
 * (at most three redirects) must be a public http(s) host.
 */
export async function guardedFetch(ctx: ServiceCtx, url: string, init: RequestInit): Promise<Response> {
  if (!ctx.config?.blockPrivateNetworks) return ctx.fetch(url, init);
  const real = ctx.fetch === globalThis.fetch;
  let current = url;
  let req: RequestInit = init;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const parsed = await assertPublicUrl(ctx, current);
    const res = real
      ? ((await undiciFetch(parsed.href, { ...(req as object), redirect: 'manual', dispatcher: agent() } as never)) as unknown as Response)
      : await ctx.fetch(parsed.href, { ...req, redirect: 'manual' });
    if (res.status < 300 || res.status >= 400) return res;
    const location = res.headers.get('location');
    if (!location) return res;
    current = new URL(location, parsed).href;
    const method = (req.method ?? 'GET').toUpperCase();
    if (res.status === 303 || ((res.status === 301 || res.status === 302) && method === 'POST')) {
      req = { ...req, method: 'GET', body: undefined };
    }
  }
  throw new BlockedAddressError(new URL(current).hostname);
}

/**
 * The address to open an SMTP connection to. With the guard on, the host must resolve to public addresses
 * only and the returned IP is used (pass the original name as the TLS server name); with it off, the host
 * is returned as given.
 */
export async function assertPublicSmtpHost(ctx: ServiceCtx, host: string): Promise<string> {
  if (!ctx.config?.blockPrivateNetworks) return host;
  const bare = host.replace(/^\[|\]$/g, '');
  if (isIP(bare) !== 0) {
    if (isPrivateAddress(bare)) throw new BlockedAddressError(host);
    return bare;
  }
  let addrs: { address: string }[];
  try {
    addrs = await (ctx.lookup ?? systemLookup)(bare);
  } catch {
    throw new BlockedAddressError(host);
  }
  if (addrs.length === 0 || addrs.some((a) => isPrivateAddress(a.address))) throw new BlockedAddressError(host);
  return addrs[0]!.address;
}
