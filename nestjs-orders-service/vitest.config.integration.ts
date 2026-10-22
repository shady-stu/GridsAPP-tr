/**
 * Integration-test (Vitest) configuration.
 *
 * Integration tests exercise the PostgreSQL adapters (repositories) and Prisma
 * transactions against a real, disposable database. They are deliberately separated
 * from the unit suite so that `npm test` stays runnable without any infrastructure.
 */
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    environment: 'node',
    include: ['test/**/*.integration-spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    setupFiles: ['./test/setup/load-test-env.ts'],
    globalSetup: ['./test/setup/global-setup.ts'],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
