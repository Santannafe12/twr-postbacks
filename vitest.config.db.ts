import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    include: ['**/*.db-spec.ts'],
    fileParallelism: false,
    setupFiles: ['./test/db/setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
