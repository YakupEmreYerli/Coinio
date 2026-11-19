import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Dev ports: Vite on 4660, API server on 4661 (see `dev:api` in package.json).
const API_TARGET = 'http://localhost:4661';
const proxied = ['/api', '/mcp', '/logos', '/oauth', '/.well-known', '/authorize', '/token', '/register', '/revoke'];

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: { outDir: 'dist/web', emptyOutDir: true },
  server: {
    port: 4660,
    strictPort: true,
    proxy: Object.fromEntries(proxied.map((p) => [p, API_TARGET])),
  },
});
