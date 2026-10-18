/**
 * Typed configuration tree.
 *
 * `configuration` is registered as a plain `@nestjs/config` load factory, so keys are
 * addressed as `'database.url'`, `'auth.jwtSecret'`, ... Application code injects
 * `TypedConfigService` (= `ConfigService<AppConfig, true>`), which makes every `get()`
 * return a non-optional value — no `!` assertions spread across the codebase.
 */
import type { ConfigService } from '@nestjs/config';
import { parseEnv, type Env } from './env.validation.js';

export interface AppConfig {
  node_env: Env['NODE_ENV'];
  isProduction: boolean;
  isTest: boolean;
  port: number;
  api: {
    globalPrefix: string;
    defaultVersion: string;
  };
  database: {
    url: string;
    poolMax: number;
    connectTimeoutMs: number;
  };
  auth: {
    jwtSecret: string;
    issuer: string;
    audience: string;
    accessTokenTtlSeconds: number;
  };
  webhooks: {
    secret: string;
    signatureToleranceSeconds: number;
    processingEnabled: boolean;
    pollIntervalMs: number;
    batchSize: number;
    maxAttempts: number;
    retryBackoffBaseMs: number;
    processingStaleAfterMs: number;
  };
  http: {
    corsOrigins: string[];
    rateLimitTtlSeconds: number;
    rateLimitLimit: number;
    trustProxy: boolean;
  };
  logging: {
    level: Env['LOG_LEVEL'];
    json: boolean;
  };
  swagger: {
    enabled: boolean;
  };
  health: {
    readinessTimeoutMs: number;
  };
}

/** Shorthand for the validated `ConfigService` used across the application. */
export type TypedConfigService = ConfigService<AppConfig, true>;

const DEV_FALLBACK_JWT_SECRET = 'dev-only-change-me-0000000000000000000000000000';
const DEV_FALLBACK_WEBHOOK_SECRET = 'dev-only-webhook-secret-change-me-000000000000';

/**
 * Test/CI convenience: when `NODE_ENV=test` allow the secrets to fall back to the
 * documented development placeholders so the suite can boot without a `.env` file.
 * Production never takes this path — `envSchema.superRefine` rejects the placeholders.
 */
export function withTestDefaults(raw: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  if (raw.NODE_ENV !== 'test') return raw;
  return {
    ...raw,
    JWT_SECRET: raw.JWT_SECRET ?? DEV_FALLBACK_JWT_SECRET,
    WEBHOOK_HMAC_SECRET: raw.WEBHOOK_HMAC_SECRET ?? DEV_FALLBACK_WEBHOOK_SECRET,
    DATABASE_URL: raw.DATABASE_URL ?? 'postgresql://orders:orders@localhost:5432/orders_test',
  };
}

export function buildConfig(raw: NodeJS.ProcessEnv = process.env): AppConfig {
  const env = parseEnv(withTestDefaults(raw));
  const isProduction = env.NODE_ENV === 'production';
  const isTest = env.NODE_ENV === 'test';

  return {
    node_env: env.NODE_ENV,
    isProduction,
    isTest,
    port: env.PORT,
    api: {
      globalPrefix: env.API_GLOBAL_PREFIX,
      defaultVersion: env.API_DEFAULT_VERSION,
    },
    database: {
      url: env.DATABASE_URL,
      poolMax: env.DATABASE_POOL_MAX,
      connectTimeoutMs: env.DATABASE_CONNECT_TIMEOUT_MS,
    },
    auth: {
      jwtSecret: env.JWT_SECRET,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      accessTokenTtlSeconds: env.JWT_ACCESS_TOKEN_TTL_SECONDS,
    },
    webhooks: {
      secret: env.WEBHOOK_HMAC_SECRET,
      signatureToleranceSeconds: env.WEBHOOK_SIGNATURE_TOLERANCE_SECONDS,
      processingEnabled: env.WEBHOOK_PROCESSING_ENABLED,
      pollIntervalMs: env.WEBHOOK_POLL_INTERVAL_MS,
      batchSize: env.WEBHOOK_BATCH_SIZE,
      maxAttempts: env.WEBHOOK_MAX_ATTEMPTS,
      retryBackoffBaseMs: env.WEBHOOK_RETRY_BACKOFF_BASE_MS,
      processingStaleAfterMs: env.WEBHOOK_PROCESSING_STALE_AFTER_MS,
    },
    http: {
      corsOrigins: env.CORS_ORIGINS,
      rateLimitTtlSeconds: env.RATE_LIMIT_TTL_SECONDS,
      rateLimitLimit: env.RATE_LIMIT_LIMIT,
      trustProxy: env.TRUST_PROXY,
    },
    logging: {
      level: env.LOG_LEVEL,
      // Structured JSON logs by default in production; human-friendly elsewhere unless overridden.
      json: env.LOG_JSON ?? isProduction,
    },
    swagger: {
      // Never expose interactive API docs from a production deployment by default.
      enabled: env.SWAGGER_ENABLED ?? !isProduction,
    },
    health: {
      readinessTimeoutMs: env.HEALTH_READINESS_TIMEOUT_MS,
    },
  };
}

/**
 * `@nestjs/config` load factory. `validationSchema` (see `env.validation.ts`) already
 * guards bootstrap; this factory yields the coerced, strongly typed tree.
 */
export default buildConfig;
