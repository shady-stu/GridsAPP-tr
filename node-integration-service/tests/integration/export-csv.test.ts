import assert from 'node:assert/strict'
import { after, before, describe, test } from 'node:test'
import type { FastifyInstance } from 'fastify'

import { buildApp } from '../../src/app.js'
import { InMemoryItemStore } from '../../src/services/items-store.js'
import { CSV_COLUMNS, itemToCsvRow } from '../../src/streams/csv-stream.js'
import type { Item } from '../../src/types/domain.js'
import { buildTestConfig } from '../helpers/test-config.js'

let app: FastifyInstance
let store: InMemoryItemStore

before(async () => {
  // Inject our own store so tests can add rows deterministically.
  store = new InMemoryItemStore()
  app = await buildApp(buildTestConfig(), { itemStore: store })
})

after(async () => {
  await app.close()
})

describe('GET /api/v1/export.csv (streaming integration)', () => {
  test('streams valid RFC 4180 CSV with the right headers', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/export.csv' })
    assert.equal(response.statusCode, 200)
    assert.equal(response.headers['content-type'], 'text/csv; charset=utf-8')
    assert.ok(String(response.headers['content-disposition']).startsWith('attachment; filename='))
    assert.equal(response.headers['cache-control'], 'no-store')

    const body = response.body
    const rows = body.split('\r\n').filter((line) => line.length > 0)
    assert.equal(rows[0], CSV_COLUMNS.join(','))
    assert.equal(rows.length, 1, 'starts with exactly the header row')
  })

  test('quotes, commas and newlines are escaped correctly (RFC 4180)', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/v1/items',
      payload: {
        name: 'Say "hello", world\nsecond line',
        description: 'contains, comma; "quotes" and\nnewline',
        category: 'books',
        price: 1234,
      },
    })

    const response = await app.inject({ method: 'GET', url: '/api/v1/export.csv' })
    assert.equal(response.statusCode, 200)
    const body = response.body
    assert.ok(body.includes('"Say ""hello"", world\nsecond line"'))
    assert.ok(body.includes('"contains, comma; ""quotes"" and\nnewline"'))
  })

  test('rows persist in store order and match the deterministic row builder', async () => {
    // One typed item directly into the injected store.
    const now = new Date().toISOString()
    const item: Item = {
      id: 'itm_9',
      name: 'Deterministic Escape Check',
      description: 'plain, "safe" value',
      category: 'home',
      price: 1499,
      createdAt: now,
      updatedAt: now,
    }
    await store.save(item)

    const response = await app.inject({ method: 'GET', url: '/api/v1/export.csv' })
    const body = response.body
    assert.ok(body.includes(itemToCsvRow(item)), 'must contain the exact row for the injected item')
    assert.ok(body.endsWith('\r\n'), 'file must end with a CRLF terminator')
  })

  test('numbers are formatted with 2 decimals (price cents -> dollars)', async () => {
    const now = new Date().toISOString()
    const item: Item = {
      id: 'itm_10',
      name: 'Price format check',
      description: '',
      category: 'fitness',
      price: 4205,
      createdAt: now,
      updatedAt: now,
    }
    await store.save(item)

    const response = await app.inject({ method: 'GET', url: '/api/v1/export.csv' })
    assert.ok(response.body.includes('42.05'))
  })

  test('an item created through the API renders its cents price consistently in CSV', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/api/v1/items',
      payload: { name: 'Round-trip Price', category: 'home', price: 2490 },
    })
    assert.equal(create.statusCode, 201)
    const created = create.json().data
    // JSON keeps minor units as an integer...
    assert.equal(created.price, 2490)

    const response = await app.inject({ method: 'GET', url: '/api/v1/export.csv' })
    // ...and the streamed CSV renders the very same value in major units.
    assert.ok(
      response.body.includes(`${created.id},Round-trip Price,,home,24.90,`),
      'created row must appear with the price formatted as 24.90',
    )
  })

  test('header line appears exactly once, at the top', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/v1/export.csv' })
    const body = response.body
    const headerAt = body.indexOf(`${CSV_COLUMNS.join(',')}\r\n`)
    assert.equal(headerAt, 0, 'must start with the header row')
    assert.equal(body.lastIndexOf(`${CSV_COLUMNS.join(',')}\r\n`), headerAt, 'single header line only')
  })
})
