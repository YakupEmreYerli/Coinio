import { defineConfig } from 'vitest/config';

const include = ['tests/**/*.test.ts', 'src/**/*.test.{ts,tsx}'];

export default defineConfig({
  test: {
    projects: [
      {
        test: { name: 'server', include, exclude: ['src/web/**', '**/node_modules/**'], environment: 'node' },
      },
      {
        test: { name: 'web', include: ['src/web/**/*.test.{ts,tsx}'], environment: 'jsdom', setupFiles: ['src/web/test-setup.ts'] },
      },
    ],
  },
});
