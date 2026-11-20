import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { APP_NAME } from '../../shared/brand.js';
import type { Locale } from '../../shared/locales.js';

/** Copied from src/web/layout/Wordmark.tsx (the server has no bundler to share it). */
export const WORDMARK_SLICES = [
  'M45.93 16.96A20.5 20.5 0 0 0 35.68 11.83',
  'M33.41 11.55A20.5 20.5 0 0 0 22.21 13.99',
  'M20.27 15.19A20.5 20.5 0 0 0 13.08 24.11',
  'M12.32 26.27A20.5 20.5 0 0 0 12.32 37.73',
  'M13.08 39.89A20.5 20.5 0 0 0 20.27 48.81',
  'M22.21 50.01A20.5 20.5 0 0 0 33.41 52.45',
  'M35.68 52.17A20.5 20.5 0 0 0 45.93 47.04',
];
export const WORDMARK_TEXT =
  'M99.51 77.56Q91.54 77.56 85 73.88Q78.46 70.19 74.59 63.76Q70.71 57.34 70.71 49.16Q70.71 40.94 74.57 34.56Q78.44 28.19 84.96 24.5Q91.49 20.81 99.51 20.81Q107.54 20.81 114.02 24.49Q120.51 28.16 124.36 34.54Q128.21 40.91 128.21 49.16Q128.21 57.36 124.32 63.79Q120.44 70.21 113.95 73.89Q107.46 77.56 99.51 77.56ZM99.51 65.56Q103.94 65.56 107.31 63.46Q110.69 61.36 112.64 57.64Q114.59 53.91 114.59 49.16Q114.59 44.41 112.64 40.75Q110.69 37.09 107.31 34.95Q103.94 32.81 99.51 32.81Q95.09 32.81 91.67 34.95Q88.26 37.09 86.3 40.75Q84.34 44.41 84.34 49.16Q84.34 53.91 86.3 57.64Q88.26 61.36 91.67 63.46Q95.09 65.56 99.51 65.56ZM134.61 76.36V22.01H147.74V76.36ZM134.61 15.86V1.86H147.74V15.86ZM156.31 76.36V22.01H168.69V32.71L167.66 30.81Q169.59 25.84 173.91 23.33Q178.24 20.81 184.01 20.81Q190.09 20.81 194.71 23.41Q199.34 26.01 201.95 30.64Q204.56 35.26 204.56 41.36V76.36H191.44V44.46Q191.44 40.84 190.06 38.26Q188.69 35.69 186.21 34.25Q183.72 32.81 180.49 32.81Q177.26 32.81 174.74 34.25Q172.21 35.69 170.82 38.28Q169.44 40.86 169.44 44.46V76.36ZM212.11 76.36V22.01H225.24V76.36ZM212.11 15.86V1.86H225.24V15.86ZM260.41 77.56Q252.44 77.56 245.9 73.88Q239.36 70.19 235.49 63.76Q231.61 57.34 231.61 49.16Q231.61 40.94 235.47 34.56Q239.34 28.19 245.86 24.5Q252.39 20.81 260.41 20.81Q268.44 20.81 274.92 24.49Q281.41 28.16 285.26 34.54Q289.11 40.91 289.11 49.16Q289.11 57.36 285.22 63.79Q281.34 70.21 274.85 73.89Q268.36 77.56 260.41 77.56ZM260.41 65.56Q264.84 65.56 268.21 63.46Q271.59 61.36 273.54 57.64Q275.49 53.91 275.49 49.16Q275.49 44.41 273.54 40.75Q271.59 37.09 268.21 34.95Q264.84 32.81 260.41 32.81Q255.99 32.81 252.57 34.95Q249.16 37.09 247.2 40.75Q245.24 44.41 245.24 49.16Q245.24 53.91 247.2 57.64Q249.16 61.36 252.57 63.46Q255.99 65.56 260.41 65.56Z';

export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const FONT_FAMILIES = [
  { slug: 'plus-jakarta-sans', family: 'Plus Jakarta Sans' },
  { slug: 'geist', family: 'Geist' },
  { slug: 'geist-mono', family: 'Geist Mono' },
];

// Fontsource subsets: Turkish letters (ğ, ş, İ) live in latin-ext.
const SUBSETS = {
  latin:
    'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  'latin-ext':
    'U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF',
};

/** @font-face rules for the variable fonts the web build already ships; empty when there is no build (system fonts then). */
export function fontFaceCss(webDir: string): string {
  let files: string[];
  try {
    files = readdirSync(join(webDir, 'assets'));
  } catch {
    return '';
  }
  const rules: string[] = [];
  for (const { slug, family } of FONT_FAMILIES) {
    for (const [subset, range] of Object.entries(SUBSETS)) {
      const re = new RegExp(`^${slug}-${subset}-wght-normal-[A-Za-z0-9_-]+\\.woff2$`);
      const file = files.find((f) => re.test(f));
      if (!file) continue;
      rules.push(
        `@font-face{font-family:'${family}';font-style:normal;font-display:swap;font-weight:100 900;` +
          `src:url(/assets/${file}) format('woff2-variations');unicode-range:${range}}`,
      );
    }
  }
  return rules.join('\n');
}

const sliceGroup = (stroke = 'var(--mark)') =>
  `<g fill="none" stroke="${stroke}" stroke-width="9">${WORDMARK_SLICES.map((d) => `<path d="${d}"/>`).join('')}</g>`;

export const wordmarkSvg = (height = 26) =>
  `<svg class="wordmark" role="img" aria-label="Coinio" height="${height}" width="${(height * 3.7468).toFixed(1)}" viewBox="0 0 293 78.2">` +
  `<g transform="scale(1.5645) translate(-7 -7)">${sliceGroup()}</g><path d="${WORDMARK_TEXT}" fill="currentColor"/></svg>`;

/** The sliced C alone, for the app tile in the connection row. */
export const markSvg = (size = 26) =>
  `<svg aria-hidden="true" width="${size}" height="${size}" viewBox="5 5 54 54">${sliceGroup()}</svg>`;

const CSS = `
:root{
  --bg:#f8f8fb;--card:#fff;--card-edge:rgba(79,91,213,.08);--sunk:#f2f2f8;--line:#e5e6ef;--line-2:#d6d8e6;
  --text:#16172b;--text-2:#575a72;--text-3:#7d8098;--heading:#0b0c1d;
  --accent:#4f5bd5;--accent-hover:#4450c8;--accent-soft:rgba(79,91,213,.09);--accent-ring:rgba(79,91,213,.38);--mark:#4f5bd5;
  --warn:#9a520b;--warn-soft:rgba(180,97,14,.09);--warn-line:rgba(180,97,14,.24);--neg:#b42d27;--neg-soft:#fbeceb;
  --grid-line:rgba(79,91,213,.11);--glow:rgba(79,91,213,.16);
  --shadow:0 1px 2px rgba(20,22,60,.05),0 18px 48px -12px rgba(30,34,90,.16);
  --cjk:system-ui;
  --head:'Plus Jakarta Sans',var(--cjk),ui-sans-serif,system-ui,sans-serif;
  --body:'Geist',var(--cjk),ui-sans-serif,system-ui,-apple-system,'Segoe UI',sans-serif;
  --mono:'Geist Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
  color-scheme:light;
}
@media (prefers-color-scheme:dark){:root{
  --bg:#07080c;--card:rgba(16,18,27,.86);--card-edge:rgba(255,255,255,.07);--sunk:rgba(255,255,255,.035);
  --line:rgba(255,255,255,.08);--line-2:rgba(255,255,255,.13);
  --text:#eceef6;--text-2:#a2a7bc;--text-3:#7a8096;--heading:#f4f5fb;
  --accent:#5965e0;--accent-hover:#6873ea;--accent-soft:rgba(142,150,255,.1);--accent-ring:rgba(142,150,255,.55);--mark:#8e96ff;
  --warn:#f0a252;--warn-soft:rgba(240,162,82,.09);--warn-line:rgba(240,162,82,.22);--neg:#ff7b73;--neg-soft:rgba(255,107,98,.1);
  --grid-line:rgba(255,255,255,.07);--glow:rgba(79,91,213,.22);
  --shadow:inset 0 1px 0 rgba(255,255,255,.05),0 0 0 1px rgba(0,0,0,.4),0 30px 80px -30px rgba(79,91,213,.4),0 12px 30px -12px rgba(0,0,0,.6);
  color-scheme:dark;
}}
:root:lang(ja){--cjk:'Hiragino Sans','Hiragino Kaku Gothic ProN','Yu Gothic UI','Yu Gothic',Meiryo,'Noto Sans JP','Noto Sans CJK JP',system-ui}
:root:lang(zh-CN){--cjk:'PingFang SC','Hiragino Sans GB','Microsoft YaHei UI','Microsoft YaHei','Noto Sans SC','Noto Sans CJK SC',system-ui}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;min-height:100vh;min-height:100dvh;background:var(--bg);color:var(--text);font:400 15px/1.55 var(--body);
  -webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;display:flex;flex-direction:column;align-items:center;
  padding:clamp(28px,8vh,88px) 16px 40px;position:relative;overflow-x:hidden}
body::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;
  background:radial-gradient(ellipse 60% 38% at 50% 0%,var(--glow),transparent 70%),
    linear-gradient(var(--grid-line) 1px,transparent 1px) 0 0/56px 56px,
    linear-gradient(90deg,var(--grid-line) 1px,transparent 1px) 0 0/56px 56px;
  -webkit-mask-image:radial-gradient(ellipse 75% 60% at 50% 18%,#000 30%,transparent 78%);
  mask-image:radial-gradient(ellipse 75% 60% at 50% 18%,#000 30%,transparent 78%)}
.brand{display:inline-flex;color:var(--heading);margin-bottom:28px;border-radius:8px}
.wordmark{display:block}
main{width:100%;max-width:428px}
.card{background:var(--card);border:1px solid var(--card-edge);border-radius:18px;box-shadow:var(--shadow);
  padding:32px 32px 28px;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px)}
@media (max-width:480px){.card{padding:26px 22px 22px;border-radius:16px}.brand{margin-bottom:22px}}
h1{font:700 22px/1.25 var(--head);letter-spacing:-.02em;color:var(--heading);margin:0;text-wrap:balance}
.lead{color:var(--text-2);margin:8px 0 0}
.lead strong,.meta strong{color:var(--text);font-weight:550}
a{color:var(--accent)}
:focus-visible{outline:2px solid var(--accent-ring);outline-offset:2px}
.connect{display:flex;align-items:center;gap:10px;margin-bottom:22px}
.tile{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;flex:none;border:1px solid var(--line);background:var(--sunk);
  font:700 18px/1 var(--head);color:var(--heading)}
.tile.coinio{background:var(--accent-soft);border-color:transparent}
.link{flex:none;width:44px;display:flex;align-items:center;justify-content:center;gap:4px;color:var(--text-3)}
.link i{width:4px;height:4px;border-radius:50%;background:currentColor;opacity:.55}
.link i:nth-child(2){opacity:.9}
.meta{display:flex;align-items:center;gap:8px;margin:14px 0 0;color:var(--text-2);font-size:13.5px}
.dot{width:6px;height:6px;border-radius:50%;background:#2fa36b;box-shadow:0 0 0 3px rgba(47,163,107,.16);flex:none}
.section{margin:24px 0 0;font:600 12px/1 var(--body);letter-spacing:.04em;text-transform:uppercase;color:var(--text-3)}
.scopes{list-style:none;margin:10px 0 0;padding:0;border:1px solid var(--line);border-radius:12px;overflow:hidden}
.scope{display:flex;gap:12px;padding:13px 14px;align-items:flex-start}
.scope+.scope{border-top:1px solid var(--line)}
.scope .glyph{flex:none;width:22px;height:22px;border-radius:7px;display:grid;place-items:center;margin-top:1px;background:var(--accent-soft);color:var(--accent)}
@media (prefers-color-scheme:dark){.scope .glyph{color:#a9b0ff}}
.scope.write{background:var(--warn-soft)}
.scope.write .glyph{background:transparent;border:1px solid var(--warn-line);color:var(--warn)}
.scope-text{min-width:0}
.scope-title{color:var(--text);font-weight:500;line-height:1.4}
.scope-sub{display:flex;flex-wrap:wrap;align-items:center;gap:6px 8px;margin-top:4px;font-size:12.5px;color:var(--text-3)}
.tag{display:inline-flex;align-items:center;height:20px;padding:0 7px;border-radius:999px;font-weight:550;font-size:11.5px;background:var(--accent-soft);color:var(--accent)}
@media (prefers-color-scheme:dark){.tag{color:#b3b9ff}}
.write .tag{background:transparent;border:1px solid var(--warn-line);color:var(--warn)}
code{font:500 12px/1 var(--mono)}
.return{display:flex;align-items:center;gap:8px;margin:18px 0 0;color:var(--text-2);font-size:13.5px}
.return svg{flex:none;color:var(--text-3)}
.actions{display:grid;grid-template-columns:1fr 1.35fr;gap:10px;margin-top:24px}
.btn{appearance:none;font:600 15px/1 var(--body);height:44px;padding:0 18px;border-radius:11px;cursor:pointer;
  display:inline-flex;align-items:center;justify-content:center;gap:8px;text-decoration:none;
  transition:background-color .15s,border-color .15s,box-shadow .15s,transform .05s}
.btn:active{transform:translateY(1px)}
.btn-primary{background:var(--accent);color:#fff;border:1px solid transparent;box-shadow:inset 0 1px 0 rgba(255,255,255,.16),0 1px 2px rgba(20,22,60,.2)}
.btn-primary:hover{background:var(--accent-hover)}
.btn-secondary{background:transparent;color:var(--text);border:1px solid var(--line-2)}
.btn-secondary:hover{background:var(--sunk)}
.btn[disabled]{cursor:progress;opacity:.8}
.foot{margin:22px 0 0;padding-top:18px;border-top:1px solid var(--line);color:var(--text-3);font-size:12.5px;text-align:center}
.field{display:block;margin-top:16px}
.field-label{display:block;font-weight:500;font-size:13.5px;color:var(--text);margin-bottom:6px}
.input-wrap{position:relative}
.input{width:100%;height:44px;padding:0 13px;border-radius:11px;border:1px solid var(--line-2);background:var(--card);color:var(--text);
  font:400 15px/1 var(--body);transition:border-color .15s,box-shadow .15s}
@media (prefers-color-scheme:dark){.input{background:rgba(0,0,0,.25)}}
.input:hover{border-color:var(--text-3)}
.input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.input[aria-invalid=true]{border-color:var(--neg)}
.has-toggle .input{padding-right:46px}
.toggle{position:absolute;top:4px;right:4px;width:36px;height:36px;border:0;border-radius:8px;background:transparent;color:var(--text-3);
  display:grid;place-items:center;cursor:pointer}
.toggle:hover{color:var(--text);background:var(--sunk)}
.toggle .eye-off{display:none}
.toggle[aria-pressed=true] .eye{display:none}
.toggle[aria-pressed=true] .eye-off{display:block}
.alert{display:flex;gap:10px;align-items:flex-start;margin-top:18px;padding:11px 13px;border-radius:11px;background:var(--neg-soft);color:var(--neg);font-size:13.5px;font-weight:500}
.alert[hidden]{display:none}
.alert svg{flex:none;margin-top:2px}
.submit{width:100%;margin-top:22px}
.spinner{width:16px;height:16px;border-radius:50%;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;animation:spin .7s linear infinite;display:none}
[aria-busy=true] .spinner{display:block}
@keyframes spin{to{transform:rotate(360deg)}}
.status-icon{width:44px;height:44px;border-radius:12px;display:grid;place-items:center;margin-bottom:18px;background:var(--accent-soft);color:var(--accent)}
.status-icon.warn{background:var(--warn-soft);color:var(--warn)}
.status .btn{margin-top:22px}
@media (prefers-reduced-motion:reduce){*{transition:none!important;animation-duration:1.5s!important}}
`;

export type PageOptions = { lang: Locale; title: string; body: string; fonts: string };

export function renderPage({ lang, title, body, fonts }: PageOptions): string {
  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark"><meta name="robots" content="noindex">
<meta name="theme-color" content="#f8f8fb" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#07080c" media="(prefers-color-scheme: dark)">
<title>${escapeHtml(title)} · ${APP_NAME}</title>
<link rel="icon" type="image/svg+xml" href="/icon.svg">
<style>${fonts}${CSS}</style></head>
<body><a class="brand" href="/">${wordmarkSvg()}</a><main>${body}</main></body></html>`;
}
