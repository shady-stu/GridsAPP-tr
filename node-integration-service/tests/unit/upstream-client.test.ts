import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { UpstreamClient } from '../../src/clients/upstream-client.js'
import {
  UpstreamBadResponseError,
  UpstreamHttpError,
  UpstreamNetworkError,
  UpstreamTimeoutError,
} from '../../src/errors/app-errors.js'
import { startAndClosePort, startMockUpstream } from '../helpers/mock-upstream.js'

const QUOTE_PAYLOAD = JSON.stringify({ id: 7, quote: 'Move fast and await.', author: 'Fam Anon' })

function clientFor(baseUrl: string, timeoutMs = 1000): UpstreamClient {
  return new UpstreamClient({ baseUrl, timeoutMs })
}

describe('UpstreamClient (local mock upstream)', () => {
  test('validates and normalizes a successful upstream response', async () => {
    const upstream = await startMockUpstream((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(QUOTE_PAYLOAD)
    })
    try {
      const quote = await clientFor(upstream.url).getRandomQuote()
      assert.deepEqual(quote, { quote: 'Move fast and await.', author: 'Fam Anon' })
    } finally {
      await upstream.close()
    }
  })

  test('maps upstream non-2xx responses without leaking their body', async () => {
    const upstream = await startMockUpstream((_req, res) => {
      res.writeHead(503, { 'content-type': 'text/plain' })
      res.end('very secret internal upstream failure details are here')
    })
    try {
      await assert.rejects(clientFor(upstream.url).getRandomQuote(), (error: unknown): boolean => {
        assert.ok(error instanceof UpstreamHttpError)
        const upstreamError = error as UpstreamHttpError
        assert.equal(upstreamError.upstreamStatus, 503)
        assert.ok(!upstreamError.message.includes('secret'), 'upstream body must not leak')
        return true
      })
    } finally {
      await upstream.close()
    }
  })

  test('rejects upstream responses that are not valid JSON', async () => {
    const upstream = await startMockUpstream((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' })
      res.end('<html>not json at all</html>')
    })
    try {
      await assert.rejects(
        clientFor(upstream.url).getRandomQuote(),
        (error: unknown): boolean => error instanceof UpstreamBadResponseError,
      )
    } finally {
      await upstream.close()
    }
  })

  test('rejects upstream payloads failing the expected schema', async () => {
    const upstream = await startMockUpstream((_req, res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ hello: true, totally_different: 'shape' }))
    })
    try {
      await assert.rejects(
        clientFor(upstream.url).getRandomQuote(),
        (error: unknown): boolean => error instanceof UpstreamBadResponseError,
      )
    } finally {
      await upstream.close()
    }
  })

  test('aborts slow upstreams after the configured timeout', async () => {
    const upstream = await startMockUpstream((_req, res) => {
      // Simulated "upstream hangs and never answers in time".
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(QUOTE_PAYLOAD)
      }, 600)
    })
    try {
      const started = Date.now()
      await assert.rejects(
        clientFor(upstream.url, 100).getRandomQuote(),
        (error: unknown): boolean => error instanceof UpstreamTimeoutError,
      )
      const elapsed = Date.now() - started
      assert.ok(elapsed < 500, `timeout should abort early, took ${elapsed}ms`)
    } finally {
      await upstream.close()
    }
  })

  test('honors caller-provided AbortSignal cancellation', async () => {
    const upstream = await startMockUpstream((_req, res) => {
      setTimeout(() => {
        res.writeHead(200)
        res.end(QUOTE_PAYLOAD)
      }, 600)
    })
    try {
      const controller = new AbortController()
      const pending = clientFor(upstream.url, 5000).getRandomQuote(controller.signal)
      setTimeout(() => controller.abort(), 50)
      await assert.rejects(pending, (error: unknown): boolean => error instanceof UpstreamTimeoutError)
    } finally {
      await upstream.close()
    }
  })

  test('maps unreachable origins to UpstreamNetworkError', async () => {
    await assert.rejects(
      clientFor(await startAndClosePort()).getRandomQuote(),
      (error: unknown): boolean => error instanceof UpstreamNetworkError,
    )
  })
})
