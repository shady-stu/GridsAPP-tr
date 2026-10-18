/**
 * Vitest `globalSetup` for the integration and E2E suites.
 *
 * Runs exactly once, in the main Vitest process, before any worker starts. Its single job is to
 * make the test database structurally identical to the development database by applying the
 * checked-in migrations:
 *
 *  * `prisma migrate deploy` is used (not `migrate dev`): it only applies committed migrations and
 *    can never author a new one, so a test run cannot silently change the migration history.
 *  * `DATABASE_URL` is pointed at the test database via `applyTestEnv()`, so the very same
 *    migration files the demo uses produce the very same schema here.
 *
 * It does **not** seed data. Fixtures are created per test file so that each suite controls its
 * own preconditions and truncation is meaningful.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { applyTestEnv, TEST_DATABASE_URL } from './test-env.js';

/** `<project>/node_modules/prisma/build/index.js`, resolved from this file's location. */
const PRISMA_CLI = fileURLToPath(new URL('../../node_modules/prisma/build/index.js', import.meta.url));

export default function globalSetup(): void {
  applyTestEnv();

  if (!existsSync(PRISMA_CLI)) {
    throw new Error(
      `Prisma CLI not found at ${PRISMA_CLI}. Run "npm install" before running the tests.`,
    );
  }

  try {
    const output = execFileSync(process.execPath, [PRISMA_CLI, 'migrate', 'deploy'], {
      env: process.env,
      encoding: 'utf8',
      stdio: 'pipe',
    });
    if (output.trim().length > 0) process.stdout.write(`${output}\n`);
  } catch (error) {
    const details =
      error && typeof error === 'object' && 'stdout' in error
        ? String((error as { stdout?: unknown }).stdout ?? '')
        : '';
    throw new Error(
      [
        `Failed to apply migrations to the test database (${TEST_DATABASE_URL}).`,
        '',
        'Start the throwaway PostgreSQL cluster first:',
        '  node scripts/local-postgres.mjs init      # first time (creates orders_dev + orders_test)',
        '  node scripts/local-postgres.mjs start     # afterwards',
        '',
        'Or point TEST_DATABASE_URL at an existing empty database.',
        details.trim().length > 0 ? `\n--- prisma output ---\n${details}` : '',
      ]
        .filter((line) => line.length > 0)
        .join('\n'),
    );
  }
}
