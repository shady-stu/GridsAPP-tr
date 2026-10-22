import type { Item, ItemListQuery, ItemPage } from '../types/domain.js'

/**
 * Persistence port for items. The current implementation is an in-memory
 * store; swapping in a database means implementing the same interface with a
 * real connection/cursor — `iterateAll` is already an AsyncIterable so a DB
 * cursor (or paginated source) can be streamed into the CSV export later.
 */
export interface ItemStore {
  list(query: ItemListQuery): Promise<ItemPage>
  get(id: string): Promise<Item | undefined>
  save(item: Item): Promise<void>
  iterateAll(signal?: AbortSignal): AsyncIterable<Item>
}

const idSortKey = (id: string): number => {
  const numeric = Number(id.replace(/^itm_/, ''))
  return Number.isFinite(numeric) ? numeric : Number.MAX_SAFE_INTEGER
}

export class InMemoryItemStore implements ItemStore {
  private readonly items = new Map<string, Item>()

  constructor(seed: readonly Item[] = []) {
    for (const item of seed) this.items.set(item.id, item)
  }

  async list(query: ItemListQuery): Promise<ItemPage> {
    const sorted = [...this.items.values()].sort((a, b) => idSortKey(a.id) - idSortKey(b.id))
    const categoryFiltered = query.category
      ? sorted.filter((item) => item.category === query.category)
      : sorted
    // Copies guard against callers mutating our store items.
    return {
      items: categoryFiltered.slice(query.offset, query.offset + query.limit).map((item) => ({ ...item })),
      total: categoryFiltered.length,
    }
  }

  async get(id: string): Promise<Item | undefined> {
    const item = this.items.get(id)
    return item ? { ...item } : undefined
  }

  async save(item: Item): Promise<void> {
    this.items.set(item.id, item)
  }

  /** Async iterable so future database cursors/pagination can slot in directly. */
  async *iterateAll(signal?: AbortSignal): AsyncIterable<Item> {
    const sorted = [...this.items.values()].sort((a, b) => idSortKey(a.id) - idSortKey(b.id))
    for (const item of sorted) {
      if (signal?.aborted) return
      yield { ...item }
    }
  }

  get size(): number {
    return this.items.size
  }
}
