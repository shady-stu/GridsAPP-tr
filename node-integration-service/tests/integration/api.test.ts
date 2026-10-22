import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import type { FastifyInstance } from 'fastify'

import { buildApp } from '../../src/app.js'
import type { QuoteProvider } from '../../src/clients/upstream-client.js'
import { UpstreamTimeoutError } from '../../src/errors/app-errors.js'
import { buildTestConfig } from '../helpers/test-config.js'

let app: FastifyInstance

const workingProvider: QuoteProvider = {
  getRandomQuote: async () => ({ quote: 'Async all the things.', author: 'Grace Tick' }),
}

const failingProvider: QuoteProvider = {
  getRandomQuote: () => Promise.reject(new UpstreamTimeoutError(1500)),
}

before(async () => {
  app = await buildApp(buildTestConfig())
})

after(async () => {
  await app.close()
})

describe('items REST API (integration, injected app)', () => {
  test('GET /api/v1/items returns seeded data with paging metadata (200)', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/items' })
    assert.equal(response.statusCode, 200)
    const body = response.json()
    assert.ok(Array.isArray(body.data))
    assert.equal(body.data.length, 20)
    assert.equal(body.meta.limit, 20)
    assert.equal(body.meta.offset, 0)
    assert.equal(body.meta.total, 20)
  })

  test('pagination honors limit/offset params (200)', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/items?limit=3&offset=5' })
    assert.equal(response.statusCode, 200)
    const body = response.json()
    assert.equal(body.data[0].id, 'itm_6')
    assert.equal(body.meta.total, 20)
  })

  test('category filter narrows to matching items (200)', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/items?category=outdoor' })
    assert.equal(response.statusCode, 200)
    const body = response.json()
    assert.ok(body.data.length > 0)
    assert.ok(body.data.every((item: { category: string }) => item.category === 'outdoor'))
    assert.equal(body.meta.total, body.data.length)
  })

  test('quote endpoint returns normalized upstream data (happy path)', async () => {
    const quoteApp = await buildApp(buildTestConfig(), { quoteProvider: workingProvider })
    try {
      const response = await quoteApp.inject({ method: 'GET', url: '/api/v1/integrations/quote' })
      assert.equal(response.statusCode, 200)
      const body = response.json()
      assert.equal(body.data.quote, 'Async all the things.')
      assert.equal(body.data.author, 'Grace Tick')
      assert.ok(typeof body.data.fetchedAt === 'string')
    } finally {
      await quoteApp.close()
    }
  })

  test('invalid query values fail with structured field errors (400)', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/items?limit=banana' })
    assert.equal(response.statusCode, 400)
    const body = response.json()
    assert.equal(body.code, 'VALIDATION_ERROR')
    assert.ok(body.errors.some((error: { path: string }) => error.path === 'query.limit'))
    assert.ok(typeof body.requestId === 'string')
  })

  test('unknown category value fails with structured field errors (400)', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/items?category=klingon' })
    assert.equal(response.statusCode, 400)
    const body = response.json()
    assert.equal(body.code, 'VALIDATION_ERROR')
    assert.ok(body.errors.some((error: { path: string }) => error.path === 'query.category'))
  })

  test('GET single item returns the record (200)', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/items/itm_2' })
    assert.equal(response.statusCode, 200)
    assert.equal(response.json().data.id, 'itm_2')
  })

  test('GET missing item returns structured 404 with request id', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/items/itm_9871' })
    assert.equal(response.statusCode, 404)
    const body = response.json()
    assert.equal(body.code, 'NOT_FOUND')
    assert.equal(body.requestId, response.headers['x-request-id'])
  })

  test('GET malformed id is a validation error (400), not a 404', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/items/oops' })
    assert.equal(response.statusCode, 400)
    const body = response.json()
    assert.equal(body.code, 'VALIDATION_ERROR')
    assert.ok(body.errors.some((error: { path: string }) => error.path === 'params.id'))
  })

  test('POST creates an item, responds 201 with Location and persists it', async () => {
    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/v1/items',
      payload: {
        name: 'Copper Wire Spool',
        category: 'electronics',
        price: 2490,
        description: '50m, 2.5mm^2',
      },
    })
    assert.equal(createResponse.statusCode, 201)
    const created = createResponse.json().data
    assert.equal(createResponse.headers.location, `/api/v1/items/${created.id}`)
    assert.equal(created.name, 'Copper Wire Spool')

    const followUp = await app.inject({ method: 'GET', url: `/api/v1/items/${created.id}` })
    assert.equal(followUp.statusCode, 200)
    assert.equal(followUp.json().data.name, 'Copper Wire Spool')
  })

  test('POST with invalid body returns structured validation errors (400)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/items',
      payload: { name: 'ab', category: 'klingon', price: -4 },
    })
    assert.equal(response.statusCode, 400)
    const body = response.json()
    assert.equal(body.code, 'VALIDATION_ERROR')
    const paths = (body.errors as Array<{ path: string }>).map((error) => error.path)
    assert.ok(paths.length === 3)
    assert.ok(paths.every((path) => path.startsWith('body.')))
    assert.ok(!('stack' in body), 'stack traces must never leak')
  })

  test('POST rejects a fractional price because prices are whole minor units', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/items',
      payload: { name: 'Fractional Price', category: 'home', price: 24.9 },
    })
    assert.equal(response.statusCode, 400)
    const body = response.json()
    assert.equal(body.code, 'VALIDATION_ERROR')
    assert.ok(
      (body.errors as Array<{ path: string }>).some((error) => error.path === 'body.price'),
      'the price field must be flagged',
    )
  })

  test('POST with empty body yields validation issues and a request id (400)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/items',
      payload: {},
    })
    assert.equal(response.statusCode, 400)
    const body = response.json()
    assert.ok(Array.isArray(body.errors))
    assert.ok(body.requestId)
  })

  test('enrich=true on a failing upstream maps to structured 504', async () => {
    const failApp = await buildApp(buildTestConfig(), { quoteProvider: failingProvider })
    try {
      const response = await failApp.inject({ method: 'GET', url: '/api/v1/items/itm_1?enrich=true' })
      assert.equal(response.statusCode, 504)
      const body = response.json()
      assert.equal(body.code, 'UPSTREAM_TIMEOUT')
      assert.ok(body.requestId)
    } finally {
      await failApp.close()
    }
  })

  test('enrich=true with working upstream returns attributed quote', async () => {
    const goodApp = await buildApp(buildTestConfig(), { quoteProvider: workingProvider })
    try {
      const response = await goodApp.inject({ method: 'GET', url: '/api/v1/items/itm_1?enrich=true' })
      assert.equal(response.statusCode, 200)
      const body = response.json()
      assert.equal(body.data.upstream.quote, 'Async all the things.')
      assert.ok(body.data.upstream.author)
    } finally {
      await goodApp.close()
    }
  })

  test('request id is propagated from the header and reused everywhere', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/items/itm_98765',
      headers: { 'x-request-id': ' propagated-call-id-42 ' },
    })
    assert.equal(response.statusCode, 404)
    assert.equal(response.headers['x-request-id'], 'propagated-call-id-42')
    assert.equal(response.json().requestId, 'propagated-call-id-42')
  })

  test('request id is generated when absent', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/items' })
    const header = response.headers['x-request-id']
    assert.equal(typeof header, 'string')
    assert.equal(String(header).length, 36)
  })

  test('unknown routes produce structured 404s too', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v99/whatevs' })
    assert.equal(response.statusCode, 404)
    assert.equal(response.json().code, 'NOT_FOUND')
  })

  test('/health reports the process is alive', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' })
    assert.equal(response.statusCode, 200)
    const body = response.json()
    assert.equal(body.status, 'ok')
    assert.ok(body.uptimeSeconds >= 0)
  })

  test('/ready reports bounded checks with the upstream probe skipped', async () => {
    const response = await app.inject({ method: 'GET', url: '/ready' })
    assert.equal(response.statusCode, 200)
    const body = response.json()
    assert.ok(Array.isArray(body.checks))
    const upstreamCheck = body.checks.find((check: { name: string }) => check.name === 'upstream')
    assert.equal(upstreamCheck.status, 'skipped')
    assert.ok(body.checks.some((check: { name: string }) => check.name === 'event-loop'))
  })

  test('security headers are set on responses', async () => {
    const response = await app.inject({ method: 'GET', url: '/health' })
    assert.ok(response.headers['x-frame-options'])
    assert.ok(response.headers['content-security-policy'])
    assert.ok(response.headers['x-content-type-options'])
  })
})
