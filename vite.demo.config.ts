import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

// Browser-only demo of the web app for the landing page: no server, data in sessionStorage.
// Built by `pnpm build:demo` into site/demo/ (served at /demo/).

/** First paint in the theme the landing page asked for (?theme=dark|light). */
const themeFromQuery: Plugin = {
  name: 'demo-theme-from-query',
  transformIndexHtml: (html) =>
    html.replace(/\s*<link rel="manifest"[^>]*>/, '').replace(
      '</head>',
      `<script>try{var m=/[?&]theme=(dark|light|night|paper)/.exec(location.search);if(m)document.documentElement.dataset.theme=/dark|night/.test(m[1])?'night':'paper'}catch(e){}</script>\n    <meta name="robots" content="noindex" />\n  </head>`,
    ),
};

export default defineConfig({
  base: '/demo/',
  plugins: [react(), tailwindcss(), themeFromQuery],
  define: { 'import.meta.env.VITE_DEMO': JSON.stringify('1') },
  publicDir: 'dist/demo-public',
  build: { outDir: 'site/demo', emptyOutDir: true },
  server: { port: 4667, strictPort: true },
  preview: { port: 4668, strictPort: true },
});
