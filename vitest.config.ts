import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const include = ['tests/**/*.test.ts', 'src/**/*.test.{ts,tsx}'];

export default defineConfig({
  resolve: { alias: { '@coinio/ext': fileURLToPath(new URL('./src/web/ext.ts', import.meta.url)) } },
  test: {
    projects: [
      {
        resolve: { alias: { '@coinio/ext': fileURLToPath(new URL('./src/web/ext.ts', import.meta.url)) } },
        test: { name: 'server', include, exclude: ['src/web/**', '**/node_modules/**'], environment: 'node' },
      },
      {
        resolve: { alias: { '@coinio/ext': fileURLToPath(new URL('./src/web/ext.ts', import.meta.url)) } },
        test: { name: 'web', include: ['src/web/**/*.test.{ts,tsx}'], environment: 'jsdom', setupFiles: ['src/web/test-setup.ts'] },
      },
    ],
  },
});
