import type { QuoteProvider } from '../clients/upstream-client.js'
import { NotFoundError, ServiceUnavailableError } from '../errors/app-errors.js'
import type { CreateItemPayload } from '../schemas/item-schemas.js'
import type { Item, ItemListQuery, QuoteAttribution } from '../types/domain.js'
import type { ItemStore } from './items-store.js'

export interface ItemListMeta {
  readonly limit: number
  readonly offset: number
  readonly total: number
}

/**
 * Application/business logic for the items API. Route handlers stay thin:
 * they validate input and delegate here.
 */
export class ItemsService {
  /**
   * IDs continue past the highest seeded id so they are unique per store.
   * 1000 is an arbitrary, human-friendly offset.
   */
  private nextSequence = 1000

  constructor(
    private readonly store: ItemStore,
    private readonly quoteProvider: QuoteProvider | null,
    private readonly clock: () => Date = () => new Date(),
  ) {}

  async list(query: ItemListQuery): Promise<{ items: Item[]; meta: ItemListMeta }> {
    const page = await this.store.list(query)
    return {
      items: page.items,
      meta: { limit: query.limit, offset: query.offset, total: page.total },
    }
  }

  async getItem(
    id: string,
    options: { enrich?: boolean; signal?: AbortSignal } = {},
  ): Promise<{ item: Item; enrichment?: QuoteAttribution }> {
    const item = await this.store.get(id)
    if (!item) throw new NotFoundError(`Item '${id}' was not found.`)
    if (options.enrich !== true) return { item }
    if (this.quoteProvider === null) {
      throw new ServiceUnavailableError('Upstream integration is not configured.')
    }
    // Upstream failures (timeout / network / bad payload) intentionally bubble
    // to the central error mapper as 502/504 instead of failing silently: the
    // caller explicitly asked for integration data.
    const quote = await this.quoteProvider.getRandomQuote(options.signal)
    return { item, enrichment: { ...quote, fetchedAt: this.clock().toISOString() } }
  }

  async create(payload: CreateItemPayload): Promise<Item> {
    const now = this.clock().toISOString()
    const item: Item = {
      id: `itm_${this.nextSequence++}`,
      name: payload.name,
      description: payload.description ?? '',
      category: payload.category,
      price: payload.price,
      createdAt: now,
      updatedAt: now,
    }
    await this.store.save(item)
    return item
  }
}
