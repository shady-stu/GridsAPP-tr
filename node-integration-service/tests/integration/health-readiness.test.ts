import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { ReadinessService, UpstreamProbe } from '../../src/services/readiness-service.js'
import { buildApp } from '../../src/app.js'
import { startMockUpstream } from '../helpers/mock-upstream.js'
import { buildTestConfig } from '../helpers/test-config.js'

describe('readiness & health (integration)', () => {
  test('/health responds 200 with process liveness info', async () => {
    const app = await buildApp(buildTestConfig())
    try {
      const response = await app.inject({ method: 'GET', url: '/health' })
      assert.equal(response.statusCode, 200)
      assert.equal(response.json().status, 'ok')
    } finally {
      await app.close()
    }
  })

  test('/ready reports ok when dependencies are trivial (no external deps)', async () => {
    const app = await buildApp(buildTestConfig({ READINESS_UPSTREAM_PROBE: 'false' }))
    try {
      const response = await app.inject({ method: 'GET', url: '/ready' })
      assert.equal(response.statusCode, 200)
      const body = response.json()
      assert.equal(body.status, 'ok')
      assert.equal(
        body.checks.some((c: { name: string }) => c.name === 'in-memory-store'),
        true,
      )
    } finally {
      await app.close()
    }
  })

  test('/ready marks a reachable upstream as ok (real bounded probe)', async () => {
    const upstream = await startMockUpstream((_req, res) => {
      res.writeHead(404) // any status counts as "reachable"
      res.end()
    })
    try {
      const readiness = new ReadinessService({
        probeUpstream: true,
        strict: false,
        upstreamBaseUrl: upstream.url,
        probe: new UpstreamProbe({ baseUrl: upstream.url, ttlMs: 200, timeoutMs: 800 }),
      })
      const report = await readiness.check()
      assert.equal(report.status, 'ok')
      const upstreamCheck = report.checks.find((c) => c.name === 'upstream')
      assert.equal(upstreamCheck?.status, 'ok')
      assert.ok((upstreamCheck?.latencyMs ?? 0) < 800)
    } finally {
      await upstream.close()
    }
  })

  test('/ready is advisory-degraded (200) when upstream is down and not strict', async () => {
    const app = await buildApp(
      buildTestConfig({
        READINESS_UPSTREAM_PROBE: 'true',
        READINESS_STRICT_UPSTREAM: 'false',
        UPSTREAM_API_URL: 'http://127.0.0.1:9', // closed port
      }),
    )
    try {
      const response = await app.inject({ method: 'GET', url: '/ready' })
      assert.equal(response.statusCode, 200)
      const body = response.json()
      const upstreamCheck = body.checks.find((c: { name: string }) => c.name === 'upstream')
      assert.equal(upstreamCheck.status, 'degraded')
    } finally {
      await app.close()
    }
  })

  test('/ready returns 503 when upstream is down and strict mode is on', async () => {
    const app = await buildApp(
      buildTestConfig({
        READINESS_UPSTREAM_PROBE: 'true',
        READINESS_STRICT_UPSTREAM: 'true',
        UPSTREAM_API_URL: 'http://127.0.0.1:9', // closed port
      }),
    )
    try {
      const response = await app.inject({ method: 'GET', url: '/ready' })
      assert.equal(response.statusCode, 503)
      const body = response.json()
      assert.equal(body.status, 'failing')
    } finally {
      await app.close()
    }
  })

  test('/ready never blocks: upstream probe is cached between calls', async () => {
    const upstream = await startMockUpstream((_req, res) => {
      res.writeHead(200)
      res.end()
    })
    try {
      const readiness = new ReadinessService({
        probeUpstream: true,
        strict: false,
        upstreamBaseUrl: upstream.url,
        probe: new UpstreamProbe({ baseUrl: upstream.url, ttlMs: 60_000 }),
      })
      await readiness.check()
      await readiness.check()
      assert.ok(true, 'second check served from cache without errors')
    } finally {
      await upstream.close()
    }
  })
})
