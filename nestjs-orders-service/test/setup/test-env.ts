/**
 * The environment every automated test runs with.
 *
 * Why an explicit, code-owned environment instead of a committed `.env.test`
 * ------------------------------------------------------------------------
 *  * A committed file can drift from the schema in `src/config/env.validation.ts` and then fail
 *    at a point (deep inside a test) that has nothing to do with the cause. Here the values sit
 *    next to the code that consumes them and are applied *before* any application module is
 *    imported.
 *  * Tests must be reachable from a cold clone: the only external requirement is the throwaway
 *    PostgreSQL cluster created by `scripts/local-postgres.mjs`, so the connection string is the
 *    documented local default and can be overridden with `TEST_DATABASE_URL`.
 *
 * `NODE_ENV=test` matters beyond convention: `withTestDefaults` (src/config/configuration.ts)
 * only permits the documented development secrets when this is `test`, which is what lets the
 * suite boot without a `.env` file while production still refuses the placeholders.
 */

/** Throwaway cluster from `scripts/local-postgres.mjs`; override with `TEST_DATABASE_URL` in CI. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://orders:orders@127.0.0.1:55432/orders_test';

/** Distinct from the development secret so a test can never accidentally sign a "real" token. */
export const TEST_JWT_SECRET = 'test-only-jwt-secret-0000000000000000000000000000';

/** Shared secret the webhook signature tests sign with. */
export const TEST_WEBHOOK_SECRET = 'test-only-webhook-secret-000000000000000000000000';

/** Secret the demo seed uses, kept out of the test environment on purpose (see TEST_JWT_SECRET). */
export const TEST_ENV: Readonly<Record<string, string>> = {
  NODE_ENV: 'test',

  DATABASE_URL: TEST_DATABASE_URL,
  DATABASE_POOL_MAX: '5',
  DATABASE_CONNECT_TIMEOUT_MS: '5000',

  JWT_SECRET: TEST_JWT_SECRET,
  JWT_ISSUER: 'grids-orders-service',
  JWT_AUDIENCE: 'grids-api',
  JWT_ACCESS_TOKEN_TTL_SECONDS: '3600',

  WEBHOOK_HMAC_SECRET: TEST_WEBHOOK_SECRET,
  WEBHOOK_SIGNATURE_TOLERANCE_SECONDS: '300',
  // The background poller is disabled: tests call `WebhookProcessorService.processOnce()`
  // explicitly so processing is deterministic instead of racing a timer.
  WEBHOOK_PROCESSING_ENABLED: 'false',
  WEBHOOK_POLL_INTERVAL_MS: '2000',
  WEBHOOK_BATCH_SIZE: '10',
  WEBHOOK_MAX_ATTEMPTS: '5',
  WEBHOOK_RETRY_BACKOFF_BASE_MS: '5000',
  WEBHOOK_PROCESSING_STALE_AFTER_MS: '60000',

  CORS_ORIGINS: '',
  RATE_LIMIT_TTL_SECONDS: '60',
  // Interact-level throttling is exercised by its own dedicated test; a low limit here would
  // make unrelated suites flaky because every request shares one in-memory counter.
  RATE_LIMIT_LIMIT: '100000',
  TRUST_PROXY: 'false',

  LOG_LEVEL: 'error',
  LOG_JSON: 'false',
  SWAGGER_ENABLED: 'false',
  HEALTH_READINESS_TIMEOUT_MS: '2000',
};

/**
 * Write the test environment into `process.env`.
 *
 * Called from two places, because Vitest runs them in different processes:
 *  * `load-test-env.ts` (a `setupFiles` entry) — once per worker, before test files import the
 *    application.
 *  * `global-setup.ts` — once in the main process, before the migration command is spawned.
 *
 * Existing values from `process.env` are overwritten deliberately: a developer with a `.env`
 * pointing at the development database must not have `npm test` silently write real data.
 */
export function applyTestEnv(overrides: Readonly<Record<string, string>> = {}): void {
  for (const [key, value] of Object.entries({ ...TEST_ENV, ...overrides })) {
    process.env[key] = value;
  }
}
