// Builds the landing site in every language from one template: `pnpm build:site`.
// Sources: site-src/template.html and site-src/i18n/<locale>.json. Output: site/index.html, site/<lang>/index.html,
// site/sitemap.xml, site/langs.json and the self-hosted fonts in site/assets/fonts/. No framework, no dependencies.
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = join(root, 'site');
const ORIGIN = 'https://getcoinio.me';
const REPO = 'https://github.com/yakupemreyerli/coinio';

/** Order = order in the language menu. `path` is the page's folder, `og` its og:locale. */
export const LANGS = [
  { code: 'en', path: '/', og: 'en_US', name: 'English' },
  { code: 'tr', path: '/tr/', og: 'tr_TR', name: 'Türkçe' },
  { code: 'de', path: '/de/', og: 'de_DE', name: 'Deutsch' },
  { code: 'fr', path: '/fr/', og: 'fr_FR', name: 'Français' },
  { code: 'es', path: '/es/', og: 'es_ES', name: 'Español' },
  { code: 'pt-BR', path: '/pt-br/', og: 'pt_BR', name: 'Português (Brasil)' },
  { code: 'zh-CN', path: '/zh/', og: 'zh_CN', name: '简体中文' },
  { code: 'ja', path: '/ja/', og: 'ja_JP', name: '日本語' },
];

// Content hashes in the asset URLs, so a phone that cached the old CSS or JS (max-age 4h) fetches the new one.
const assetHash = (f) => createHash('sha256').update(readFileSync(join(site, f))).digest('hex').slice(0, 10);
const ASSET_V = { css: assetHash('styles.css'), js: assetHash('main.js') };

const FAQ = ['free', 'needs', 'data', 'https', 'updates', 'privacy', 'family', 'import', 'languages', 'mcp', 'iphone', 'sheet'];

// The one code block inside the FAQ: identical in every language.
const BACKUP_CODE = `<pre><code>docker run --rm -v coinio-data:/data -v "$PWD":/backup alpine \\
  tar czf /backup/coinio-backup.tgz -C /data .</code></pre>`;

const template = readFileSync(join(root, 'site-src/template.html'), 'utf8');
const catalogs = Object.fromEntries(LANGS.map((l) => [l.code, JSON.parse(readFileSync(join(root, `site-src/i18n/${l.code}.json`), 'utf8'))]));
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

const escAttr = (s) => s.replace(/&(?![a-z]+;|#\d+;)/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const plain = (html) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
const jsonLd = (data) => `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;

// Fonts: the variable woff2 files the web app already depends on, latin + latin-ext, named by content hash.
const FONTS = [
  { pkg: 'geist', family: 'Geist', preload: true },
  { pkg: 'geist-mono', family: 'Geist Mono', preload: false },
  { pkg: 'plus-jakarta-sans', family: 'Plus Jakarta Sans', preload: true },
];
const SUBSETS = {
  latin:
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  'latin-ext':
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
};

function buildFonts() {
  const dir = join(site, 'assets/fonts');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const faces = [];
  const preloads = [];
  for (const f of FONTS) {
    for (const [subset, range] of Object.entries(SUBSETS)) {
      const src = join(root, `node_modules/@fontsource-variable/${f.pkg}/files/${f.pkg}-${subset}-wght-normal.woff2`);
      const hash = createHash('sha256').update(readFileSync(src)).digest('hex').slice(0, 8);
      const name = `${f.pkg}-${subset}.${hash}.woff2`;
      copyFileSync(src, join(dir, name));
      faces.push(`@font-face{font-family:"${f.family}";font-style:normal;font-weight:100 900;font-display:swap;src:url(/assets/fonts/${name}) format("woff2");unicode-range:${range}}`);
      if (f.preload && subset === 'latin') preloads.push(`<link rel="preload" href="/assets/fonts/${name}" as="font" type="font/woff2" crossorigin>`);
    }
  }
  return { faces: faces.join('\n'), preloads: preloads.join('\n  ') };
}

function head(lang, t, fonts) {
  const url = ORIGIN + lang.path;
  const alternates = LANGS.map((l) => `<link rel="alternate" hreflang="${l.code}" href="${ORIGIN}${l.path}">`);
  alternates.push(`<link rel="alternate" hreflang="x-default" href="${ORIGIN}/">`);
  const faq = FAQ.map((id) => ({
    '@type': 'Question',
    name: plain(t[`faq.${id}.q`]),
    acceptedAnswer: { '@type': 'Answer', text: plain(t[`faq.${id}.a`].replace('{{code.backup}}', BACKUP_CODE)) },
  }));
  const graph = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: 'Coinio',
        url,
        description: t['app.description'],
        applicationCategory: 'FinanceApplication',
        applicationSubCategory: 'Subscription tracker',
        operatingSystem: 'Docker, Linux',
        softwareVersion: version,
        isAccessibleForFree: true,
        license: 'https://opensource.org/licenses/MIT',
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
        downloadUrl: REPO,
        installUrl: `${ORIGIN}/install`,
        screenshot: `${ORIGIN}/assets/dashboard-night.webp`,
        image: `${ORIGIN}/assets/og.png`,
        inLanguage: LANGS.map((l) => l.code),
        sameAs: [REPO],
      },
      { '@type': 'FAQPage', inLanguage: lang.code, url, mainEntity: faq },
    ],
  };
  return `  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escAttr(t['meta.title'])}</title>
  <meta name="description" content="${escAttr(t['meta.description'])}">
  <meta name="theme-color" content="#07080c">
  <meta name="color-scheme" content="dark light">
  <link rel="canonical" href="${url}">
  ${alternates.join('\n  ')}
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Coinio">
  <meta property="og:title" content="${escAttr(t['og.title'])}">
  <meta property="og:description" content="${escAttr(t['og.description'])}">
  <meta property="og:url" content="${url}">
  <meta property="og:locale" content="${lang.og}">
  ${LANGS.filter((l) => l !== lang).map((l) => `<meta property="og:locale:alternate" content="${l.og}">`).join('\n  ')}
  <meta property="og:image" content="${ORIGIN}/assets/og.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${escAttr(t['og.title'])}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escAttr(t['og.title'])}">
  <meta name="twitter:description" content="${escAttr(t['og.description'])}">
  <meta name="twitter:image" content="${ORIGIN}/assets/og.png">
  <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">
  ${fonts.preloads}
  <style>${fonts.faces}</style>
  <link rel="stylesheet" href="/styles.css?v=${ASSET_V.css}">
  ${jsonLd(graph)}`;
}

function faqList(t) {
  return FAQ.map(
    (id) => `          <details>
            <summary>${t[`faq.${id}.q`]}</summary>
            <div class="faq-a">
              ${t[`faq.${id}.a`].replace('{{code.backup}}', BACKUP_CODE).split('\n').join('\n              ')}
            </div>
          </details>`,
  ).join('\n');
}

const GLOBE =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.25"/><path d="M1.75 8h12.5M8 1.75c1.8 1.9 2.6 3.9 2.6 6.25S9.8 12.35 8 14.25C6.2 12.35 5.4 10.35 5.4 8S6.2 3.65 8 1.75z"/></svg>';

function langPicker(lang, t) {
  const items = LANGS.map(
    (l) =>
      `            <li><a href="${l.path}" hreflang="${l.code}" lang="${l.code}"${l === lang ? ' aria-current="page"' : ''}>${l.name}</a></li>`,
  ).join('\n');
  const short = lang.code.split('-')[0].toUpperCase();
  return `        <details class="lang">
          <summary aria-label="${escAttr(`${t['lang.label']}: ${lang.name}`)}" title="${escAttr(t['lang.label'])}">${GLOBE}<span>${short}</span></summary>
          <ul class="lang-menu">
${items}
          </ul>
        </details>`;
}

function langFooter(lang, t) {
  const links = LANGS.map((l) => `<a href="${l.path}" hreflang="${l.code}" lang="${l.code}"${l === lang ? ' aria-current="page"' : ''}>${l.name}</a>`);
  return `      <nav class="footer-langs" aria-label="${escAttr(t['footer.languages'])}">${links.join('')}</nav>`;
}

function page(lang, fonts) {
  const t = catalogs[lang.code];
  const en = catalogs.en;
  const missing = Object.keys(en).filter((k) => !(k in t));
  if (missing.length) throw new Error(`${lang.code}: missing ${missing.join(', ')}`);
  const vars = {
    lang: lang.code,
    head: head(lang, t, fonts),
    faq: faqList(t),
    langPicker: langPicker(lang, t),
    langFooter: langFooter(lang, t),
    demoHref: `/demo/?lang=${lang.code}`,
  };
  const html = template.replaceAll('src="/main.js"', `src="/main.js?v=${ASSET_V.js}"`).replace(/\{\{(@?)([\w.-]+)\}\}/g, (m, at, key) => {
    const v = key in vars ? vars[key] : t[key];
    if (v === undefined) throw new Error(`${lang.code}: unknown placeholder ${m}`);
    return at ? escAttr(v) : v;
  });
  if ((html.match(/<h1[\s>]/g) ?? []).length !== 1) throw new Error(`${lang.code}: expected exactly one h1`);
  return html;
}

function sitemap() {
  const links = LANGS.map((l) => `    <xhtml:link rel="alternate" hreflang="${l.code}" href="${ORIGIN}${l.path}"/>`)
    .concat(`    <xhtml:link rel="alternate" hreflang="x-default" href="${ORIGIN}/"/>`)
    .join('\n');
  const urls = LANGS.map((l) => `  <url>\n    <loc>${ORIGIN}${l.path}</loc>\n${links}\n  </url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`;
}

const fonts = buildFonts();
for (const lang of LANGS) {
  const dir = join(site, lang.path);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), page(lang, fonts));
}
writeFileSync(join(site, 'sitemap.xml'), sitemap());
// The "also in your language" hint: main.js fetches this only when the browser prefers another language.
const langs = Object.fromEntries(
  LANGS.map((l) => [l.code, { path: l.path, text: catalogs[l.code]['lang.suggest'], go: catalogs[l.code]['lang.suggestGo'], dismiss: catalogs[l.code]['lang.dismiss'] }]),
);
writeFileSync(join(site, 'langs.json'), `${JSON.stringify(langs, null, 2)}\n`);
console.log(`site: ${LANGS.length} pages, ${readdirSync(join(site, 'assets/fonts')).length} font files`);
