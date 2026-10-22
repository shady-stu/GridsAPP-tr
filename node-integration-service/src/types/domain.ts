/**
 * Global domain types for the Node Integration Service.
 *
 * The service manages "items" (integration records) in an in-memory store and
 * enriches them with data from a configurable upstream HTTP API.
 */

export const ITEM_CATEGORIES = ['electronics', 'books', 'home', 'outdoor', 'fitness'] as const

export type ItemCategory = (typeof ITEM_CATEGORIES)[number]

export interface Item {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly category: ItemCategory
  readonly price: number
  /** ISO 8601 timestamp string */
  readonly createdAt: string
  /** ISO 8601 timestamp string */
  readonly updatedAt: string
}

export interface CreateItemInput {
  readonly name: string
  readonly description?: string
  readonly category: ItemCategory
  readonly price: number
}

export interface ItemListQuery {
  readonly limit: number
  readonly offset: number
  readonly category?: ItemCategory
}

export interface ItemPage {
  readonly items: Item[]
  readonly total: number
}

/**
 * Normalized shape returned by the upstream quote API. The raw upstream
 * payload is validated and reduced to these two fields, so unknown/sensitive
 * upstream properties never reach our own API consumers.
 */
export interface NormalizedQuote {
  readonly quote: string
  readonly author: string
}

/**
 * Attributed quote data merged into an item response when `?enrich=true` is used.
 */
export interface QuoteAttribution {
  readonly quote: string
  readonly author: string
  readonly fetchedAt: string
}
