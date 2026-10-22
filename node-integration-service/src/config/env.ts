import { z } from 'zod'

/**
 * Centralized, typed configuration.
 *
 * Rules implemented here:
 * - Every environment variable is parsed through Zod exactly once, at startup.
 * - No other module reads process.env directly.
 * - Defaults are only used where they are safe (never for URLs that would be
 *   environment-specific in production, but a public keyless API is a fine dev).
 * - URLs are syntactically validated, numbers are range-checked.
 */

export class ConfigValidationError extends Error {
  readonly issues: ReadonlyArray<{ path: string; message: string }>

  constructor(issues: ReadonlyArray<{ path: string; message: string }>) {
    super(`Invalid environment configuration: ${issues.map((i) => `${i.path}: ${i.message}`).join('; ')}`)
    this.name = 'ConfigValidationError'
    this.issues = issues
  }
}

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const
const NODE_ENVS = ['development', 'test', 'production'] as const

/** Turns the classic "true"/"false"/"1"/"0" env var values into booleans. */
const BooleanInput = z
  .union([z.boolean(), z.literal('true'), z.literal('false'), z.literal('1'), z.literal('0')])
  .transform((value) => value === true || value === 'true' || value === '1')

/** Treats empty strings as "unset" so that e.g. `PORT=` falls back safely. */
const optionalString = (value: unknown): unknown =>
  typeof value === 'string' && value.trim() === '' ? undefined : value

/** http(s) URL validation (z.string().url() alone would accept ftp:// etc.). */
const HttpUrl = z
  .string()
  .url({ message: 'must be an absolute http(s) URL' })
  .refine((value) => {
    try {
      const { protocol } = new URL(value)
      return protocol === 'http:' || protocol === 'https:'
    } catch {
      return false
    }
  }, 'must be an absolute http(s) URL')

const EnvSchema = z.object({
  NODE_ENV: z.preprocess(optionalString, z.enum(NODE_ENVS).default('development')),
  PORT: z.preprocess(
    optionalString,
    z.coerce.number().int('must be an integer').min(0).max(65535).default(3000),
  ),
  HOST: z.preprocess(optionalString, z.string().min(1).max(253).default('0.0.0.0')),
  LOG_LEVEL: z.preprocess(optionalString, z.enum(LOG_LEVELS).default('info')),
  UPSTREAM_API_URL: z.preprocess(optionalString, HttpUrl.default('https://dummyjson.com')),
  UPSTREAM_TIMEOUT_MS: z.preprocess(
    optionalString,
    z.coerce
      .number()
      .int('must be an integer')
      .min(50, 'must be at least 50ms')
      .max(60_000, 'must be at most 60000ms')
      .default(5_000),
  ),
  RATE_LIMIT_MAX: z.preprocess(optionalString, z.coerce.number().int().min(1).max(100_000).default(240)),
  RATE_LIMIT_WINDOW_SECONDS: z.preprocess(
    optionalString,
    z.coerce.number().int().min(1).max(3600).default(60),
  ),
  SHUTDOWN_GRACE_MS: z.preprocess(
    optionalString,
    z.coerce.number().int().min(100).max(120_000).default(10_000),
  ),
  READINESS_UPSTREAM_PROBE: z.preprocess(optionalString, BooleanInput.default(true)),
  READINESS_STRICT_UPSTREAM: z.preprocess(optionalString, BooleanInput.default(false)),
  ENABLE_DEMO_BLOCK: z.preprocess(optionalString, BooleanInput.default(false)),
})

export interface AppConfig {
  readonly port: number
  readonly host: string
  readonly nodeEnv: (typeof NODE_ENVS)[number]
  readonly logLevel: (typeof LOG_LEVELS)[number]
  readonly upstream: {
    readonly baseUrl: string
    /** Outbound request timeout in milliseconds. */
    readonly timeoutMs: number
  }
  readonly rateLimit: {
    readonly max: number
    readonly windowMs: number
  }
  readonly shutdownGraceMs: number
  readonly readiness: {
    readonly upstreamProbe: boolean
    readonly strictUpstream: boolean
  }
  readonly enableDemoBlock: boolean
}

/**
 * Parses raw environment values into the typed AppConfig.
 *
 * @param env defaults to process.env; tests pass an explicit object instead so
 *        no test ever depends on the real machine environment.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({
      path: issue.path.length > 0 ? issue.path.join('.') : '(root)',
      message: issue.message,
    }))
    throw new ConfigValidationError(issues)
  }
  const data = parsed.data
  return Object.freeze({
    port: data.PORT,
    host: data.HOST,
    nodeEnv: data.NODE_ENV,
    logLevel: data.LOG_LEVEL,
    upstream: Object.freeze({
      // strip a trailing slash so path joins below never produce '//' sequences
      baseUrl: data.UPSTREAM_API_URL.replace(/\/+$/, ''),
      timeoutMs: data.UPSTREAM_TIMEOUT_MS,
    }),
    rateLimit: Object.freeze({
      max: data.RATE_LIMIT_MAX,
      windowMs: data.RATE_LIMIT_WINDOW_SECONDS * 1_000,
    }),
    shutdownGraceMs: data.SHUTDOWN_GRACE_MS,
    readiness: Object.freeze({
      upstreamProbe: data.READINESS_UPSTREAM_PROBE,
      strictUpstream: data.READINESS_STRICT_UPSTREAM,
    }),
    enableDemoBlock: data.ENABLE_DEMO_BLOCK,
  })
}
