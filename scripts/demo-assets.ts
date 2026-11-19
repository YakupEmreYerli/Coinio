// Static files for the browser-only demo: the app's public/ folder plus brand logos for the
// built-in catalog and the sample data (Simple Icons, rendered like the server does), and an index.
// Usage: tsx scripts/demo-assets.ts <out-dir>
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CATALOG } from '../src/shared/catalog.js';
import { SAMPLE_SUBSCRIPTIONS } from '../src/shared/sampleData.js';
import { brandSvg, exactBrand } from '../src/server/services/logoCandidates.js';

const out = process.argv[2];
if (!out) throw new Error('usage: tsx scripts/demo-assets.ts <out-dir>');
rmSync(out, { recursive: true, force: true });
cpSync('public', out, { recursive: true });
// The install manifest points at the root of a real Coinio; the demo is not installable.
rmSync(join(out, 'manifest.webmanifest'));
const logos = join(out, 'logos');
mkdirSync(logos, { recursive: true });
// Hand-picked site icons for samples that have no Simple Icons brand (file name = domain).
cpSync('src/web/demo/logos', logos, { recursive: true });

const domains: Record<string, string> = { 'chatgpt.com': 'chatgpt.com.png' };
const brands = new Map<string, { slug: string; title: string; hex: string }>();
const all = [...CATALOG.map((c) => c.domain), ...SAMPLE_SUBSCRIPTIONS.flatMap((s) => (s.domain ? [s.domain] : []))];
for (const domain of new Set(all)) {
  const brand = exactBrand(domain);
  if (!brand || domains[domain]) continue;
  domains[domain] = `${brand.slug}.svg`;
  if (brands.has(brand.slug)) continue;
  brands.set(brand.slug, { slug: brand.slug, title: brand.title, hex: brand.hex });
  writeFileSync(join(logos, `${brand.slug}.svg`), brandSvg(brand.slug, 'filled')!);
  writeFileSync(join(logos, `${brand.slug}-plain.svg`), brandSvg(brand.slug, 'plain')!);
}
writeFileSync(join(logos, 'index.json'), JSON.stringify({ domains, brands: [...brands.values()] }));
console.log(`demo assets: ${brands.size} brand logos in ${logos}`);
