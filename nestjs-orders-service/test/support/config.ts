/**
 * Unit-test helper: a `TypedConfigService` stand-in.
 *
 * Most unit tests only need a handful of configuration values, and depending on a real
 * `@nestjs/config` container for that would turn a pure unit test into a partial integration
 * test. This helper flattens the *real*, validated configuration tree produced by
 * `buildConfig(process.env)` and lets a test override individual dotted keys.
 *
 * Using the real tree (rather than hand-picked literals) is deliberate: if a config key is
 * renamed, the unit tests fail loudly instead of quietly reading `undefined`.
 */
import { buildConfig, type AppConfig, type TypedConfigService } from '../../src/config/configuration.js';

/** `{ a: { b: 1 } }` -> `{ 'a.b': 1 }`, so overrides can be written as dotted paths. */
function flatten(input: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      Object.assign(result, flatten(value as Record<string, unknown>, path));
    } else {
      result[path] = value;
    }
  }
  return result;
}

/**
 * @param overrides dotted paths, e.g. `{ 'webhooks.maxAttempts': 2 }`.
 */
export function createTestConfig(overrides: Record<string, unknown> = {}): TypedConfigService {
  const values = { ...flatten(buildConfig(process.env) as unknown as Record<string, unknown>), ...overrides };

  const service = {
    get: (key: string): unknown => values[key],
    getOrThrow: (key: string): unknown => {
      const value = values[key];
      if (value === undefined) throw new Error(`Configuration key "${key}" is not defined`);
      return value;
    },
  };

  // The application only ever calls `.get()` / `.getOrThrow()` on this type; the cast keeps the
  // helper free of the many unused methods `ConfigService` declares.
  return service as unknown as TypedConfigService;
}

/** Convenience for the common case: the real tree with no changes. */
export function testConfig(): TypedConfigService {
  return createTestConfig();
}

/** A fully-typed sample config, useful when a test asserts against the defaults themselves. */
export function testAppConfig(): AppConfig {
  return buildConfig(process.env);
}
