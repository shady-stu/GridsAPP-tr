import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import type { FastifyInstance } from 'fastify'

import { buildApp } from '../../src/app.js'
import { createShutdownController } from '../../src/runtime/shutdown.js'
import { buildTestConfig } from '../helpers/test-config.js'

describe('graceful shutdown controller', () => {
  test('closes the app, records exit code 0 and is idempotent', async () => {
    const app = await buildApp(buildTestConfig())
    const exitCodes: number[] = []
    const controller = createShutdownController({
      app,
      log: app.log,
      graceMs: 5_000,
      exit: (code) => {
        exitCodes.push(code)
      },
    })

    await controller.request('SIGTERM')
    assert.deepEqual(exitCodes, [0])
    assert.equal(controller.shuttingDown, true)

    // Second call (e.g. a second signal arriving) must be a no-op.
    await controller.request('SIGINT')
    assert.deepEqual(exitCodes, [0])
  })

  test('reports finish resolve with code 1 when the server close fails', async () => {
    const failingApp = {
      close: () => Promise.reject(new Error('close exploded')),
    } as unknown as FastifyInstance
    const exitCodes: number[] = []
    const controller = createShutdownController({
      app: failingApp,
      log: {
        info: () => {},
        warn: () => {},
        error: () => {},
      },
      graceMs: 500,
      exit: (code) => {
        exitCodes.push(code)
      },
    })
    await controller.request('SIGTERM')
    const code = await controller.finish
    assert.equal(code, 1)
    assert.deepEqual(exitCodes, [1])
  })

  test('falls back to a forced exit when close() hangs past the grace period', async () => {
    const hangingApp = {
      close: () => new Promise<void>(() => {}),
    } as unknown as FastifyInstance
    const exitCodes: number[] = []
    const controller = createShutdownController({
      app: hangingApp,
      log: { info: () => {}, warn: () => {}, error: () => {} },
      graceMs: 150,
      exit: (code) => {
        exitCodes.push(code)
      },
    })
    void controller.request('SIGTERM').catch(() => {})
    const started = Date.now()
    const code = await controller.finish
    assert.equal(code, 1, 'grace period expiry must become a forced exit with code 1')
    assert.deepEqual(exitCodes, [1])
    assert.ok(Date.now() - started < 3_000, 'forced exit should arrive near the grace timeout')
  })

  test('running against a live listening server stops accepting requests', async () => {
    const app = await buildApp(buildTestConfig())
    await app.listen({ port: 0, host: '127.0.0.1' })
    const address = app.server.address()
    assert.ok(address && typeof address === 'object')
    const url = `http://127.0.0.1:${String(address.port)}/health`

    // The server is definitely up.
    const healthy = await fetch(url)
    assert.equal(healthy.status, 200)
    await healthy.arrayBuffer()

    const exitCodes: number[] = []
    const controller = createShutdownController({
      app,
      log: app.log,
      graceMs: 2_000,
      exit: (code) => {
        exitCodes.push(code)
      },
    })
    await controller.request('SIGTERM')
    assert.deepEqual(exitCodes, [0])
    try {
      await fetch(url)
      assert.fail('server should be closed')
    } catch (error: unknown) {
      const cause = (error as { cause?: { code?: string } }).cause
      assert.equal(cause?.code, 'ECONNREFUSED', `expected connection refused, got ${String(error)}`)
    }
  })
})
