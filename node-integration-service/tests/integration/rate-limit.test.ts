import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { buildApp } from '../../src/app.js'
import { buildTestConfig } from '../helpers/test-config.js'

describe('rate limiting', () => {
  test('returns structured 429s once the window budget is exhausted', async () => {
    const app = await buildApp(buildTestConfig({ RATE_LIMIT_MAX: '3', RATE_LIMIT_WINDOW_SECONDS: '60' }))
    try {
      const first = await app.inject({ method: 'GET', url: '/api/v1/items' })
      assert.equal(first.statusCode, 200)
      const second = await app.inject({ method: 'GET', url: '/api/v1/items' })
      assert.equal(second.statusCode, 200)
      const third = await app.inject({ method: 'GET', url: '/api/v1/items' })
      assert.equal(third.statusCode, 200)

      const blocked = await app.inject({ method: 'GET', url: '/api/v1/items' })
      assert.equal(blocked.statusCode, 429)
      const body = blocked.json()
      assert.equal(body.code, 'RATE_LIMITED')
      assert.ok(body.requestId)
      retryAfterHeaderCheck(blocked)
    } finally {
      await app.close()
    }
  })

  test('health endpoints are exempt from rate limiting', async () => {
    const app = await buildApp(buildTestConfig({ RATE_LIMIT_MAX: '1', RATE_LIMIT_WINDOW_SECONDS: '60' }))
    try {
      // /health would trip a strict limiter; it must always be available.
      for (let i = 0; i < 4; i += 1) {
        const response = await app.inject({ method: 'GET', url: '/health' })
        assert.equal(response.statusCode, 200)
      }
    } finally {
      await app.close()
    }
  })
})

function retryAfterHeaderCheck(response: { headers: Record<string, unknown> }): void {
  const retryAfter = Number(response.headers['retry-after'] ?? 'NaN')
  assert.ok(
    Number.isFinite(retryAfter) && retryAfter >= 0,
    `expected numeric retry-after header, got ${retryAfter}`,
  )
}
