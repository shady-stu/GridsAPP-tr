/**
 * E2E (Vitest) configuration.
 *
 * E2E tests boot a real Nest application (through `@nestjs/testing` + Supertest) and talk
 * to it over HTTP. The suite is executed serially (single worker, no file parallelism)
 * because it shares one PostgreSQL database and truncates tables between tests.
 */
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    environment: 'node',
    include: ['test/**/*.e2e-spec.ts'],
    exclude: ['**/node_modules/**', '**/dist/**'],
    setupFiles: ['./test/setup/load-test-env.ts'],
    // Applies the checked-in migrations to the test database once, before any worker boots.
    globalSetup: ['./test/setup/global-setup.ts'],
    // Shared database: run files one at a time so truncation is not racy.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
