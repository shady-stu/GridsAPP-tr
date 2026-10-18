/**
 * Environment contract.
 *
 * NestJS 12 moves configuration validation to the Standard Schema specification, so
 * `@nestjs/config` accepts a Zod (or Valibot/ArkType) schema directly instead of a
 * Joi schema. We keep a single schema here and reuse it in two places:
 *
 *   1. `ConfigModule.forRoot({ validationSchema })` — fails fast during bootstrap.
 *   2. `configuration()` — produces the strongly typed, already-coerced config tree.
 *
 * Bootstrapping aborts when a variable is missing or malformed, and — importantly —
 * when a *development default* secret is used while `NODE_ENV=production`.
 */
import { z } from 'zod';

/**
 * The documented placeholder values shipped in `.env.example`. They are safe for local
 * development and explicitly rejected in production (see `superRefine` below).
 */
export const DEV_SECRET_PLACEHOLDERS = [
  'dev-only-change-me-0000000000000000000000000000',
  'dev-only-webhook-secret-change-me-000000000000',
] as const;

const booleanish = z
  .union([z.boolean(), z.enum(['true', 'false', '1', '0', 'yes', 'no'])])
  .transform((value) => {
    if (typeof value === 'boolean') return value;
    return value === 'true' || value === '1' || value === 'yes';
  });

const csv = z
  .string()
  .transform((value) =>
    value
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  );

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production', 'provision']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    API_GLOBAL_PREFIX: z.string().min(1).default('api'),
    API_DEFAULT_VERSION: z.enum(['1']).default('1'),

    // --- Database -----------------------------------------------------------
    DATABASE_URL: z
      .string()
      .min(1)
      .refine((value) => value.startsWith('postgres://') || value.startsWith('postgresql://'), {
        message: 'DATABASE_URL must be a postgres:// or postgresql:// connection string',
      }),
    DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(200).default(10),
    DATABASE_CONNECT_TIMEOUT_MS: z.coerce.number().int().min(100).default(5_000),

    // --- Authentication -----------------------------------------------------
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_ISSUER: z.string().min(1).default('grids-orders-service'),
    JWT_AUDIENCE: z.string().min(1).default('grids-api'),
    JWT_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(3_600),

    // --- Webhooks -----------------------------------------------------------
    WEBHOOK_HMAC_SECRET: z.string().min(32, 'WEBHOOK_HMAC_SECRET must be at least 32 characters'),
    WEBHOOK_SIGNATURE_TOLERANCE_SECONDS: z.coerce.number().int().min(1).max(3_600).default(300),
    WEBHOOK_PROCESSING_ENABLED: booleanish.default(true),
    WEBHOOK_POLL_INTERVAL_MS: z.coerce.number().int().min(100).default(2_000),
    WEBHOOK_BATCH_SIZE: z.coerce.number().int().min(1).max(200).default(10),
    WEBHOOK_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(50).default(5),
    WEBHOOK_RETRY_BACKOFF_BASE_MS: z.coerce.number().int().min(100).default(5_000),
    WEBHOOK_PROCESSING_STALE_AFTER_MS: z.coerce.number().int().min(1_000).default(60_000),

    // --- HTTP hardening & observability -------------------------------------
    CORS_ORIGINS: csv.default([]),
    RATE_LIMIT_TTL_SECONDS: z.coerce.number().int().min(1).default(60),
    RATE_LIMIT_LIMIT: z.coerce.number().int().min(1).default(100),
    LOG_LEVEL: z.enum(['debug', 'log', 'warn', 'error']).default('log'),
    LOG_JSON: booleanish.optional(),
    SWAGGER_ENABLED: booleanish.optional(),
    HEALTH_READINESS_TIMEOUT_MS: z.coerce.number().int().min(100).default(2_000),
    TRUST_PROXY: booleanish.default(false),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;

    const placeholders: ReadonlyArray<string> = DEV_SECRET_PLACEHOLDERS;
    if (placeholders.includes(env.JWT_SECRET)) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message: 'JWT_SECRET still uses the development placeholder; set a real secret in production',
      });
    }
    if (placeholders.includes(env.WEBHOOK_HMAC_SECRET)) {
      ctx.addIssue({
        code: 'custom',
        path: ['WEBHOOK_HMAC_SECRET'],
        message:
          'WEBHOOK_HMAC_SECRET still uses the development placeholder; set a real secret in production',
      });
    }
    if (env.CORS_ORIGINS.includes('*')) {
      ctx.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'Wildcard CORS origins are not allowed in production',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

/** Format Zod issues into a compact, log-friendly list (never echoes secret values). */
export function formatEnvIssues(error: z.ZodError<unknown>): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n');
}

/**
 * Parse and validate `process.env`. Intended to be called from configuration loaders
 * and from bootstrap; throws with a readable message so the process exits instead of
 * booting with a half-configured application.
 */
export function parseEnv(raw: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${formatEnvIssues(result.error)}`);
  }
  return result.data;
}
