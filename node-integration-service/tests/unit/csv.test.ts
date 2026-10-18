import { deepStrictEqual, equal, ok } from 'node:assert/strict'
import { once } from 'node:events'
import { Readable } from 'node:stream'
import { describe, test } from 'node:test'

import {
  CSV_COLUMNS,
  createItemCsvStream,
  escapeCsvField,
  itemToCsvRow,
  joinCsvRow,
} from '../../src/streams/csv-stream.js'
import type { Item } from '../../src/types/domain.js'

const HEADER_ROW = `${CSV_COLUMNS.join(',')}\r\n`

function makeItem(overrides: Partial<Item> = {}): Item {
  return {
    id: 'itm_1',
    name: 'Plain item',
    description: '',
    category: 'home',
    price: 1250,
    createdAt: '2026-01-10T09:00:01.000Z',
    updatedAt: '2026-01-10T09:00:01.000Z',
    ...overrides,
  }
}

describe('CSV escaping (RFC 4180)', () => {
  test('plain values pass through untouched', () => {
    equal(escapeCsvField('abc'), 'abc')
    equal(escapeCsvField(1250), '1250')
    equal(escapeCsvField(null), '')
    equal(escapeCsvField(undefined), '')
  })

  test('special values are quoted and internal quotes doubled', () => {
    equal(escapeCsvField('Say "hi"'), '"Say ""hi"""')
    equal(escapeCsvField('a,b'), '"a,b"')
    equal(escapeCsvField('one\ntwo'), '"one\ntwo"')
    equal(escapeCsvField('one\r\ntwo'), '"one\r\ntwo"')
  })

  test('rows are comma-joined with CRLF terminators', () => {
    equal(joinCsvRow(['a', 'b,c', 'd"e']), 'a,"b,c","d""e"\r\n')
    equal(
      itemToCsvRow(makeItem({ price: 1250, createdAt: '2026-01-10T09:00:01.000Z' })),
      'itm_1,Plain item,,home,12.50,2026-01-10T09:00:01.000Z\r\n',
    )
  })
})

describe('CSV stream', () => {
  test('emits header first, then one row per item', async () => {
    const stream = createItemCsvStream([
      makeItem(),
      makeItem({ id: 'itm_2', name: 'A "quoted", comma name' }),
    ])
    deepStrictEqual(await stream.toArray(), [
      HEADER_ROW,
      'itm_1,Plain item,,home,12.50,2026-01-10T09:00:01.000Z\r\n',
      'itm_2,"A ""quoted"", comma name",,home,12.50,2026-01-10T09:00:01.000Z\r\n',
    ])
  })

  test('supports async iterable sources (no full in-memory build)', async () => {
    // Simulates a database cursor: items arrive one by one.
    async function* source(): AsyncGenerator<Item> {
      for (let i = 1; i <= 3; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1))
        yield makeItem({ id: `itm_${i}` })
      }
    }
    const stream = createItemCsvStream(source())
    const rows = await stream.toArray()
    equal(rows.length, 4)
    ok(rows[0].startsWith('id,'), 'first chunk must be the header row')
  })

  test('abort signal stops generation early (client disconnect pattern)', async () => {
    const controller = new AbortController()
    let produced = 0
    async function* slowSource(): AsyncGenerator<Item> {
      while (true) {
        produced += 1
        await new Promise((resolve) => setTimeout(resolve, 2))
        yield makeItem({ id: `itm_${produced}` })
      }
    }
    const stream = createItemCsvStream(slowSource(), { signal: controller.signal })
    const [firstChunk] = (await once(stream, 'data')) as [unknown]
    controller.abort()
    const rest = await stream.toArray()
    const received = [firstChunk, ...rest].map(String).join('')
    ok(produced < 100, `source kept being pulled after abort (${produced} rows)`)
    ok(received.startsWith(HEADER_ROW), 'header still present')
  })

  test('works as a Readable (pipe contract fulfilled)', async () => {
    const stream = createItemCsvStream([makeItem()])
    ok(stream instanceof Readable)
    const all = await stream.toArray()
    equal(all.length, 2)
  })
})
