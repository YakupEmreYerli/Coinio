import { createHash } from 'node:crypto';
import * as simpleIcons from 'simple-icons';
import type { ServiceCtx } from './context.js';
import { isPublicHost } from './netGuard.js';

export { isPublicHost };
import { MAX_LOGO_BYTES, fetchLogo, readCapped, sniffLogoExt, writeLogoFile, type LogoExt } from './logos.js';

export type LogoCandidate = {
  id: string;
  kind: 'brand' | 'site' | 'ddg';
  label: string;
  previewUrl: string;
  size: number | null;
  hex?: string;
};
export type BrandStyle = 'filled' | 'plain';

export class UnknownCandidateError extends Error {}
export class CandidateFetchError extends Error {}

type Brand = { slug: string; title: string; hex: string; path: string };

const BRANDS: Brand[] = (Object.values(simpleIcons) as unknown[])
  .filter((x): x is Brand => !!x && typeof x === 'object' && 'slug' in x && 'path' in x)
  .map(({ slug, title, hex, path }) => ({ slug, title, hex, path }));
const BRAND_BY_SLUG = new Map(BRANDS.map((b) => [b.slug, b]));

const sha1 = (s: string) => createHash('sha1').update(s).digest('hex');
const norm = (s: string) =>
  s
    .toLocaleLowerCase('tr')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
const NORM_TITLES = new Map(BRANDS.map((b) => [b.slug, norm(b.title)]));

/** "music.youtube.com" → "youtube", "claude.ai" → "claude"; anything else is normalized whole. */
function searchKey(query: string): string {
  const q = query.trim().toLowerCase();
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(q)) {
    const labels = q.split('.').filter((l) => l !== 'www');
    return norm(labels.length >= 2 ? labels[labels.length - 2]! : labels[0]!);
  }
  return norm(q);
}

function scoredBrands(query: string): { brand: Brand; score: number }[] {
  const key = searchKey(query);
  if (!key) return [];
  const out: { brand: Brand; score: number }[] = [];
  for (const brand of BRANDS) {
    const title = NORM_TITLES.get(brand.slug)!;
    const score =
      brand.slug === key || title === key ? 0
      : key.length >= 3 && (title.startsWith(key) || brand.slug.startsWith(key)) ? 1
      : key.length >= 3 && title.includes(key) ? 2
      : -1;
    if (score >= 0) out.push({ brand, score });
  }
  return out.sort((a, b) => a.score - b.score || a.brand.title.length - b.brand.title.length);
}

export function findBrands(query: string, limit = 12): { slug: string; title: string; hex: string }[] {
  return scoredBrands(query)
    .slice(0, limit)
    .map(({ brand: { slug, title, hex } }) => ({ slug, title, hex }));
}

export function exactBrand(domain: string): Brand | null {
  const best = scoredBrands(domain)[0];
  return best && best.score === 0 ? best.brand : null;
}

function luminance(hex: string): number {
  const n = parseInt(hex, 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

/** Square brand tile: brand colour behind a white (or dark, for light brands) mark, or the mark in brand colour on white. */
export function brandSvg(slug: string, style: BrandStyle = 'filled'): string | null {
  const b = BRAND_BY_SLUG.get(slug);
  if (!b) return null;
  const lum = luminance(b.hex);
  const bg = style === 'filled' ? `#${b.hex}` : '#ffffff';
  const fg = style === 'filled' ? (lum > 0.6 ? '#111111' : '#ffffff') : lum > 0.85 ? '#111111' : `#${b.hex}`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="256" height="256"><rect width="24" height="24" fill="${bg}"/><g transform="translate(5 5) scale(0.5833)"><path fill="${fg}" d="${b.path}"/></g></svg>`;
}

// Many sites (Trendyol among them) answer 403 to a bare Node fetch; ask like a browser does.
const BROWSER_HEADERS = {
  'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  accept: 'text/html,application/xhtml+xml,image/avif,image/webp,image/svg+xml,image/*,*/*;q=0.8',
};

/** https GET of a public host, following at most 3 redirects (each re-checked). */
async function fetchPublic(ctx: ServiceCtx, url: string, maxBytes: number): Promise<{ buf: Buffer; type: string; url: string } | null> {
  let current = url;
  for (let hop = 0; hop <= 3; hop++) {
    let parsed: URL;
    try {
      parsed = new URL(current);
    } catch {
      return null;
    }
    if (parsed.protocol !== 'https:' || !(await isPublicHost(ctx, parsed.hostname))) return null;
    const res = await ctx.fetch(parsed.href, { signal: AbortSignal.timeout(8000), redirect: 'manual', headers: BROWSER_HEADERS });
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      if (!loc) return null;
      current = new URL(loc, parsed).href;
      continue;
    }
    if (!res.ok) return null;
    const buf = await readCapped(res, maxBytes);
    return buf ? { buf, type: (res.headers.get('content-type') ?? '').toLowerCase(), url: parsed.href } : null;
  }
  return null;
}

const attrRe = /([a-zA-Z][\w-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(attrRe)) out[m[1]!.toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  return out;
}
function maxSize(sizes: string | undefined): number | null {
  if (!sizes) return null;
  if (sizes.trim().toLowerCase() === 'any') return 512;
  const nums = [...sizes.matchAll(/(\d+)x\d+/gi)].map((m) => Number(m[1]));
  return nums.length ? Math.max(...nums) : null;
}

/** Icons the site itself advertises (link tags, web manifest), biggest first; only https URLs on public hosts. */
export async function discoverSiteIcons(ctx: ServiceCtx, domain: string): Promise<{ url: string; size: number | null }[]> {
  if (!(await isPublicHost(ctx, domain))) return [];
  const found: { url: string; size: number | null }[] = [];
  const page = await fetchPublic(ctx, `https://${domain}/`, 1024 * 1024).catch(() => null);
  if (page && page.type.includes('html')) {
    const head = page.buf.toString('utf8').slice(0, 300_000);
    for (const m of head.matchAll(/<link\b[^>]*>/gi)) {
      const a = attrs(m[0]);
      if (!a.href || a.href.startsWith('data:')) continue;
      const rel = (a.rel ?? '').toLowerCase().split(/\s+/);
      let url: string;
      try {
        url = new URL(a.href, page.url).href;
      } catch {
        continue;
      }
      if (rel.some((r) => r.startsWith('apple-touch-icon'))) found.push({ url, size: maxSize(a.sizes) ?? 180 });
      else if (rel.includes('icon')) found.push({ url, size: maxSize(a.sizes) ?? (url.endsWith('.svg') ? 512 : null) });
      else if (rel.includes('manifest')) {
        const man = await fetchPublic(ctx, url, 200 * 1024).catch(() => null);
        try {
          const icons = man ? (JSON.parse(man.buf.toString('utf8')).icons as { src?: string; sizes?: string }[]) : [];
          for (const icon of Array.isArray(icons) ? icons : []) {
            if (typeof icon?.src === 'string') found.push({ url: new URL(icon.src, man!.url).href, size: maxSize(icon.sizes) });
          }
        } catch {
          // not a manifest
        }
      }
    }
  }
  if (found.length === 0) {
    found.push({ url: `https://${domain}/apple-touch-icon.png`, size: null }, { url: `https://${domain}/favicon.ico`, size: null });
  }
  const hostOk = new Map<string, boolean>();
  const out: { url: string; size: number | null }[] = [];
  for (const icon of found) {
    const u = new URL(icon.url);
    if (u.protocol !== 'https:' || out.some((o) => o.url === icon.url)) continue;
    if (!hostOk.has(u.hostname)) hostOk.set(u.hostname, await isPublicHost(ctx, u.hostname));
    if (hostOk.get(u.hostname)) out.push(icon);
  }
  return out.sort((a, b) => (b.size ?? -1) - (a.size ?? -1)).slice(0, 8);
}

type CachedCandidate = { url: string; expires: number; image?: { buf: Buffer; ext: LogoExt } };
const CANDIDATE_TTL_MS = 10 * 60 * 1000;
const issued = new Map<string, CachedCandidate>();

function issue(url: string): string {
  const id = sha1(url);
  const now = Date.now();
  for (const [k, v] of issued) if (v.expires < now) issued.delete(k);
  issued.set(id, { ...issued.get(id), url, expires: now + CANDIDATE_TTL_MS });
  return id;
}

async function downloadImage(ctx: ServiceCtx, url: string): Promise<{ buf: Buffer; ext: LogoExt } | null> {
  const got = await fetchPublic(ctx, url, MAX_LOGO_BYTES).catch(() => null);
  const ext = got ? sniffLogoExt(got.buf) : null;
  return got && ext ? { buf: got.buf, ext } : null;
}

/** Image bytes of an issued site/ddg candidate, fetched once and kept with the candidate. */
export async function candidateImage(ctx: ServiceCtx, id: string): Promise<{ buf: Buffer; ext: LogoExt } | null> {
  const entry = issued.get(id);
  if (!entry || entry.expires < Date.now()) throw new UnknownCandidateError(id);
  entry.image ??= (await downloadImage(ctx, entry.url)) ?? undefined;
  return entry.image ?? null;
}

export async function getCandidates(ctx: ServiceCtx, q: string, domain: string | null): Promise<LogoCandidate[]> {
  const brands = new Map<string, { slug: string; title: string; hex: string }>();
  for (const b of [...(domain ? findBrands(domain, 6) : []), ...(q ? findBrands(q, 12) : [])]) brands.set(b.slug, b);
  const out: LogoCandidate[] = [...brands.values()].map((b) => ({
    id: `brand:${b.slug}`,
    kind: 'brand',
    label: b.title,
    previewUrl: `/api/logos/brand/${b.slug}.svg?style=filled`,
    size: null,
    hex: `#${b.hex}`,
  }));
  if (domain && (await isPublicHost(ctx, domain))) {
    for (const icon of await discoverSiteIcons(ctx, domain)) {
      const id = issue(icon.url);
      out.push({ id, kind: 'site', label: new URL(icon.url).hostname, previewUrl: `/api/logos/proxy/${id}`, size: icon.size });
    }
    const gid = issue(googleIconUrl(domain));
    out.push({ id: gid, kind: 'site', label: 'Google', previewUrl: `/api/logos/proxy/${gid}`, size: null });
    const id = issue(`https://icons.duckduckgo.com/ip3/${domain}.ico`);
    out.push({ id, kind: 'ddg', label: 'DuckDuckGo', previewUrl: `/api/logos/proxy/${id}`, size: null });
  }
  return out;
}

/** Turns a candidate into stored bytes: generated SVG for a brand, the downloaded image otherwise. */
export async function candidateFile(ctx: ServiceCtx, candidateId: string, style: BrandStyle): Promise<{ buf: Buffer; ext: LogoExt }> {
  if (candidateId.startsWith('brand:')) {
    const svg = brandSvg(candidateId.slice(6), style);
    if (!svg) throw new UnknownCandidateError(candidateId);
    return { buf: Buffer.from(svg), ext: 'svg' };
  }
  const image = await candidateImage(ctx, candidateId);
  if (!image) throw new CandidateFetchError(candidateId);
  return image;
}

/** Pixel width of a PNG, ICO (largest entry) or SVG (treated as large); null when unknown. */
export function imageWidth(buf: Buffer, ext: LogoExt): number | null {
  if (ext === 'svg') return 512;
  if (ext === 'png' && buf.length >= 24) return buf.readUInt32BE(16) || null;
  if (ext === 'ico' && buf.length >= 6) {
    let best = 0;
    for (let i = 0, n = buf.readUInt16LE(4); i < n && 6 + i * 16 < buf.length; i++) best = Math.max(best, buf[6 + i * 16] || 256);
    return best || null;
  }
  return null;
}

const googleIconUrl = (domain: string) =>
  `https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&size=256&url=https://${encodeURIComponent(domain)}`;

/** Automatic pick for a new domain: exact brand, the biggest site icon (≥ 64 px), Google's icon cache, then DuckDuckGo. */
export async function fetchBestLogo(ctx: ServiceCtx, domain: string): Promise<string | null> {
  const name = sha1(domain);
  const brand = exactBrand(domain);
  if (brand) return writeLogoFile(ctx.config.dataDir, `${name}.svg`, Buffer.from(brandSvg(brand.slug, 'filled')!));
  for (const icon of await discoverSiteIcons(ctx, domain)) {
    if (icon.size !== null && icon.size < 64) continue;
    const image = await downloadImage(ctx, icon.url);
    if (image && (imageWidth(image.buf, image.ext) ?? 64) >= 64) return writeLogoFile(ctx.config.dataDir, `${name}.${image.ext}`, image.buf);
  }
  // Google's icon cache often has a large icon when the site itself blocks us; it answers 404 when it has none.
  const google = await downloadImage(ctx, googleIconUrl(domain));
  if (google && (imageWidth(google.buf, google.ext) ?? 64) >= 64) return writeLogoFile(ctx.config.dataDir, `${name}.${google.ext}`, google.buf);
  return fetchLogo(ctx, domain);
}
