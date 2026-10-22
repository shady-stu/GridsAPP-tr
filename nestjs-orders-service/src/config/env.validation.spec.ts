/**
 * Unit tests for the environment contract.
 *
 * Configuration is the first thing that can go wrong on a deploy, and the failure must be loud and
 * specific. These tests cover coercion, defaults, and — most importantly — that the documented
 * development secret placeholders are rejected in production.
 */
import { describe, expect, it } from 'vitest';
import {
  DEV_SECRET_PLACEHOLDERS,
  formatEnvIssues,
  parseEnv,
  envSchema,
} from './env.validation.js';
import { withTestDefaults } from './configuration.js';

/** The smallest environment that is allowed to boot. */
const MINIMAL_ENV = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_SECRET: 'a'.repeat(48),
  WEBHOOK_HMAC_SECRET: 'b'.repeat(48),
};

describe('parseEnv', () => {
  it('parses a minimal environment and applies documented defaults', () => {
    const env = parseEnv(MINIMAL_ENV);
    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.API_GLOBAL_PREFIX).toBe('api');
    expect(env.API_DEFAULT_VERSION).toBe('1');
    expect(env.DATABASE_POOL_MAX).toBe(10);
    expect(env.JWT_ISSUER).toBe('grids-orders-service');
    expect(env.JWT_AUDIENCE).toBe('grids-api');
    expect(env.WEBHOOK_PROCESSING_ENABLED).toBe(true);
    expect(env.WEBHOOK_MAX_ATTEMPTS).toBe(5);
    expect(env.CORS_ORIGINS).toEqual([]);
    expect(env.LOG_LEVEL).toBe('log');
    expect(env.LOG_JSON).toBeUndefined();
    expect(env.SWAGGER_ENABLED).toBeUndefined();
  });

  it('coerces numeric strings', () => {
    expect(parseEnv({ ...MINIMAL_ENV, PORT: '8080' }).PORT).toBe(8080);
  });

  it('coerces the various truthy/falsy spellings', () => {
    expect(parseEnv({ ...MINIMAL_ENV, WEBHOOK_PROCESSING_ENABLED: 'no' }).WEBHOOK_PROCESSING_ENABLED).toBe(false);
    expect(parseEnv({ ...MINIMAL_ENV, WEBHOOK_PROCESSING_ENABLED: 'yes' }).WEBHOOK_PROCESSING_ENABLED).toBe(true);
    expect(parseEnv({ ...MINIMAL_ENV, WEBHOOK_PROCESSING_ENABLED: '0' }).WEBHOOK_PROCESSING_ENABLED).toBe(false);
    expect(parseEnv({ ...MINIMAL_ENV, WEBHOOK_PROCESSING_ENABLED: '1' }).WEBHOOK_PROCESSING_ENABLED).toBe(true);
  });

  it('splits the comma-separated CORS allow-list and trims entries', () => {
    expect(parseEnv({ ...MINIMAL_ENV, CORS_ORIGINS: 'https://a.test, https://b.test ,' }).CORS_ORIGINS).toEqual([
      'https://a.test',
      'https://b.test',
    ]);
  });

  it.each([
    ['a missing JWT_SECRET', { DATABASE_URL: MINIMAL_ENV.DATABASE_URL, WEBHOOK_HMAC_SECRET: MINIMAL_ENV.WEBHOOK_HMAC_SECRET }],
    ['a too-short JWT_SECRET', { ...MINIMAL_ENV, JWT_SECRET: 'short' }],
    ['a non-postgres DATABASE_URL', { ...MINIMAL_ENV, DATABASE_URL: 'mysql://localhost/db' }],
    ['a PORT out of range', { ...MINIMAL_ENV, PORT: '70000' }],
    ['an unknown LOG_LEVEL', { ...MINIMAL_ENV, LOG_LEVEL: 'verbose' }],
  ])('throws for %s', (_label, raw) => {
    expect(() => parseEnv(raw)).toThrow(/Invalid environment configuration/);
  });

  it('reports the offending field in the message', () => {
    try {
      parseEnv({ ...MINIMAL_ENV, PORT: '70000' });
      expect.unreachable('expected parseEnv to throw');
    } catch (error) {
      expect((error as Error).message).toContain('PORT');
    }
  });
});

describe('production safety', () => {
  it('rejects the documented JWT placeholder', () => {
    expect(() =>
      parseEnv({
        ...MINIMAL_ENV,
        NODE_ENV: 'production',
        JWT_SECRET: DEV_SECRET_PLACEHOLDERS[0],
      }),
    ).toThrow(/placeholder/);
  });

  it('rejects the documented webhook placeholder', () => {
    expect(() =>
      parseEnv({
        ...MINIMAL_ENV,
        NODE_ENV: 'production',
        WEBHOOK_HMAC_SECRET: DEV_SECRET_PLACEHOLDERS[1],
      }),
    ).toThrow(/placeholder/);
  });

  it('rejects a wildcard CORS origin', () => {
    expect(() =>
      parseEnv({ ...MINIMAL_ENV, NODE_ENV: 'production', CORS_ORIGINS: 'https://a.test,*' }),
    ).toThrow(/Wildcard CORS/);
  });

  it('accepts real secrets', () => {
    expect(() => parseEnv({ ...MINIMAL_ENV, NODE_ENV: 'production' })).not.toThrow();
  });

  it('allows the placeholders outside production', () => {
    expect(() =>
      parseEnv({ ...MINIMAL_ENV, NODE_ENV: 'development', JWT_SECRET: DEV_SECRET_PLACEHOLDERS[0] }),
    ).not.toThrow();
  });
});

describe('withTestDefaults', () => {
  it('leaves a non-test environment untouched', () => {
    const raw = { NODE_ENV: 'development' };
    expect(withTestDefaults(raw)).toBe(raw);
  });

  it('fills the secrets only when NODE_ENV=test', () => {
    const filled = withTestDefaults({ NODE_ENV: 'test' });
    expect(filled.JWT_SECRET).toBeDefined();
    expect(filled.WEBHOOK_HMAC_SECRET).toBeDefined();
    expect(filled.DATABASE_URL).toBeDefined();
  });

  it('does not overwrite values that are already set', () => {
    const filled = withTestDefaults({ NODE_ENV: 'test', JWT_SECRET: 'explicit-secret-value-00000000000000000000' });
    expect(filled.JWT_SECRET).toBe('explicit-secret-value-00000000000000000000');
  });
});

describe('formatEnvIssues', () => {
  it('renders one line per issue with a dotted path', () => {
    const result = envSchema.safeParse({ DATABASE_URL: 'nope' });
    expect(result.success).toBe(false);
    if (result.success) return;
    const formatted = formatEnvIssues(result.error);
    expect(formatted).toContain('DATABASE_URL');
    expect(formatted).toMatch(/^\s+- /m);
  });
});
