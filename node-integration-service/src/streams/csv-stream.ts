import { Readable } from 'node:stream'

import type { Item } from '../types/domain.js'

/**
 * CSV export, built on Node.js streams.
 *
 * Streaming rules implemented here:
 * - The CSV is NEVER assembled as one big string in memory. `Readable.from()`
 *   wraps an async generator that yields one CSV line at a time, and Node
 *   applies natural backpressure (the generator only advances when the
 *   consumer pulls the next chunk via pipe()).
 * - Columns are an explicit allow-list: if a sensitive field is added to Item,
 *   it cannot leak into exports unless the column list is deliberately edited.
 * - CSV escaping follows RFC 4180: fields containing commas, quotes or line
 *   breaks are quoted and internal quotes are doubled.
 */

export const CSV_COLUMNS = ['id', 'name', 'description', 'category', 'price', 'created_at'] as const

/** Escapes a single CSV field per RFC 4180. */
export function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return ''
  const text = typeof value === 'string' ? value : String(value)
  const needsQuoting = /[",\r\n]/.test(text)
  return needsQuoting ? `"${text.replace(/"/g, '""')}"` : text
}

export function joinCsvRow(fields: readonly unknown[], separator = '\r\n'): string {
  return `${fields.map(escapeCsvField).join(',')}${separator}`
}

/** Prices are stored in cents to avoid floating point; CSV shows 2 decimals. */
export function formatPrice(price: number): string {
  return (price / 100).toFixed(2)
}

export function itemToCsvRow(item: Item): string {
  return joinCsvRow([
    item.id,
    item.name,
    item.description,
    item.category,
    formatPrice(item.price),
    item.createdAt,
  ])
}

export function createCsvHeaderRow(separator = '\r\n'): string {
  return joinCsvRow([...CSV_COLUMNS], separator)
}

/**
 * Wraps an async item source into a Readable of CSV chunks.
 *
 * `signal` lets the transport cancel generation early (e.g. when the HTTP
 * client disconnects). Because the source is an AsyncIterable, this can be
 * backed later by a database cursor without changing the stream logic.
 */
export function createItemCsvStream(
  source: AsyncIterable<Item> | Iterable<Item>,
  options: { readonly highWaterMark?: number; readonly signal?: AbortSignal } = {},
): Readable {
  async function* generateCsv(): AsyncGenerator<string, void, undefined> {
    yield createCsvHeaderRow()
    for await (const item of source) {
      // Give the client-disconnect path a cheap early exit: the store's
      // iterator checks the same signal, which stops consumption immediately.
      if (options.signal?.aborted) return
      yield itemToCsvRow(item)
    }
  }
  return Readable.from(generateCsv(), { highWaterMark: options.highWaterMark ?? 16 })
}
