/**
 * Unit-test (Vitest) configuration.
 *
 * Unit tests are colocated with the source as `*.spec.ts` and must never touch a real
 * database, network or filesystem outside of mocks/fakes. Anything that needs real
 * infrastructure belongs in `test/` and is run through the integration or E2E configs.
 */
import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    // The Prisma client output is generated code; never collect or mutate it.
    exclude: ['**/node_modules/**', '**/dist/**', 'src/generated/**'],
    // Guarantees `NODE_ENV=test` (and the rest of the test environment) is in place before any
    // test file imports application code. No database is involved, so `npm test` stays runnable
    // on a machine without PostgreSQL.
    setupFiles: ['./test/setup/load-test-env.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      reportsDirectory: './coverage/unit',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'src/generated/**',
        'src/**/*.module.ts',
        'src/main.ts',
        'src/**/index.ts',
      ],
    },
  },
});
