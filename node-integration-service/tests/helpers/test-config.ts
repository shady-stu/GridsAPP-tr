import type { FastifyInstance } from 'fastify'

import { buildApp, type AppDependencies } from '../../src/app.js'
import { loadConfig, type AppConfig } from '../../src/config/env.js'

/**
 * Test environment defaults: internal URLs only, disabled readiness probe,
 * effectively unlimited rate limit. No test should ever touch the real
 * machine environment or the public internet.
 */
export const TEST_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  PORT: '0',
  HOST: '127.0.0.1',
  // 'silent' == no log output on the test terminal
  LOG_LEVEL: 'silent',
  // closed-port URL: integration code paths must never reach the internet
  UPSTREAM_API_URL: 'http://127.0.0.1:9',
  UPSTREAM_TIMEOUT_MS: '3000',
  READINESS_UPSTREAM_PROBE: 'false',
  RATE_LIMIT_MAX: '100000',
}

export function buildTestConfig(overrides: Record<string, string> = {}): AppConfig {
  return loadConfig({ ...TEST_ENV, ...overrides })
}

/**
 * Builds an app instance with safe test defaults.
 * Call it exactly once per suite and close it in an `after` hook.
 */
export async function buildTestAppInstance(
  overrides: Record<string, string> = {},
  deps: AppDependencies = {},
): Promise<FastifyInstance> {
  return buildApp(buildTestConfig(overrides), deps)
}
