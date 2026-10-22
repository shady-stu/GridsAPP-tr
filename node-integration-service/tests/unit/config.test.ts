import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { z } from 'zod'
import pino from 'pino'

import { ConfigValidationError, loadConfig } from '../../src/config/env.js'
import {
  NotFoundError,
  UpstreamHttpError,
  UpstreamTimeoutError,
  mapErrorToHttpResponse,
  zodIssuesToFieldIssues,
} from '../../src/errors/app-errors.js'
import { createLoggerOptions } from '../../src/logging/create-logger.js'

describe('typed configuration', () => {
  test('sensible defaults when everything is unset', () => {
    const config = loadConfig({})
    assert.deepEqual(
      [
        config.port,
        config.host,
        config.nodeEnv,
        config.logLevel,
        config.upstream.baseUrl,
        config.upstream.timeoutMs,
        config.rateLimit.max,
        config.rateLimit.windowMs,
        config.shutdownGraceMs,
        config.readiness.upstreamProbe,
        config.readiness.strictUpstream,
        config.enableDemoBlock,
      ],
      [
        3000,
        '0.0.0.0',
        'development',
        'info',
        'https://dummyjson.com',
        5000,
        240,
        60_000,
        10_000,
        true,
        false,
        false,
      ],
    )
  })

  test('numeric and boolean env values are coerced and validated', () => {
    const config = loadConfig({
      PORT: '8080',
      UPSTREAM_TIMEOUT_MS: '1500',
      READINESS_UPSTREAM_PROBE: 'false',
      ENABLE_DEMO_BLOCK: 'true',
      NODE_ENV: 'production',
      RATE_LIMIT_MAX: '5',
      RATE_LIMIT_WINDOW_SECONDS: '10',
    })
    assert.deepEqual(
      [
        config.port,
        config.upstream.timeoutMs,
        config.readiness.upstreamProbe,
        config.enableDemoBlock,
        config.nodeEnv,
        config.rateLimit.windowMs,
      ],
      [8080, 1500, false, true, 'production', 10_000],
    )
  })

  test('empty strings fall back to defaults instead of failing coercion', () => {
    const config = loadConfig({ PORT: '', LOG_LEVEL: '' })
    assert.equal(config.port, 3000)
    assert.equal(config.logLevel, 'info')
  })

  test('rejects invalid numbers and ranges with a structured config error', () => {
    for (const badEnv of [
      { PORT: 'zoom' },
      { PORT: '70100' },
      { UPSTREAM_TIMEOUT_MS: '0' },
      { UPSTREAM_TIMEOUT_MS: 'annoyingly large' },
      { NODE_ENV: 'staging' },
    ]) {
      assert.throws(
        () => loadConfig(badEnv),
        (error: unknown) => error instanceof ConfigValidationError,
        `expected ConfigValidationError for ${JSON.stringify(badEnv)}`,
      )
    }
  })

  test('rejects malformed or non-http upstream URLs', () => {
    for (const bad of ['definitely no url', 'ftp://example.com', '127.0.0.1:1/no-scheme']) {
      assert.throws(
        () => loadConfig({ UPSTREAM_API_URL: bad }),
        (error: unknown) => error instanceof ConfigValidationError,
        `expected rejection for ${bad}`,
      )
    }
  })
})

describe('error model mapping', () => {
  test('typed errors keep their status code and safe message', () => {
    assert.equal(mapErrorToHttpResponse(new NotFoundError('nope'), 'req-1').statusCode, 404)
    assert.equal(mapErrorToHttpResponse(new UpstreamTimeoutError(1000), 'req-1').statusCode, 504)
    assert.equal(mapErrorToHttpResponse(new UpstreamHttpError(511), 'req-1').statusCode, 502)
  })

  test('unknown errors collapse to a generic 500 without leaking details', () => {
    const secretError = new Error('SECRET_SAUCE=abc; do not leak')
    const mapped = mapErrorToHttpResponse(secretError, 'req-1')
    assert.equal(mapped.statusCode, 500)
    assert.equal(mapped.body.message, 'Internal server error.')
    assert.ok(!JSON.stringify(mapped.body).includes('SECRET'))
    assert.equal(mapped.body.requestId, 'req-1')
  })

  test('ZodError from inline parsing maps to a validation error with fields', () => {
    let zodError: z.ZodError | undefined
    try {
      z.object({ name: z.string().min(1) }).parse({})
    } catch (error) {
      if (error instanceof z.ZodError) zodError = error
    }
    assert.ok(zodError, 'expected a ZodError to be thrown')
    const mapped = mapErrorToHttpResponse(zodError, 'req-1')
    assert.equal(mapped.statusCode, 400)
    assert.equal(mapped.body.code, 'VALIDATION_ERROR')
    const issues = zodIssuesToFieldIssues(zodError, 'body')
    assert.ok(issues.length > 0)
    assert.equal(issues[0]?.path, 'body.name')
    assert.equal(mapped.body.errors?.length, 1)
  })

  test('upstream errors never embed raw bodies', () => {
    const mapped = mapErrorToHttpResponse(new UpstreamHttpError(500), 'req-1')
    assert.equal(mapped.statusCode, 502)
    assert.equal(mapped.body.code, 'UPSTREAM_HTTP_ERROR')
    assert.ok(!('upstreamStatus' in mapped.body))
  })
})

describe('structured logger', () => {
  test('creates working loggers at all levels with redaction bindings', () => {
    const logger = pino(createLoggerOptions({ logLevel: 'silent', nodeEnv: 'test' }))
    logger.info({ sessionId: 'x' }, 'runtime event')
    logger.warn({ reqId: 1 }, 'runtime warn event')
    logger.error({ err: new Error('runtime error') }, 'runtime error event')
    assert.equal(typeof logger.child({ requestId: 'abc' }).info, 'function')
  })
})
