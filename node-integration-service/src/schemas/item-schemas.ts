import { z } from 'zod'

import { ITEM_CATEGORIES } from '../types/domain.js'
import { ValidationError, zodIssuesToFieldIssues } from '../errors/app-errors.js'

/**
 * Every route parses its inputs through these schemas via `validateInput`.
 * This keeps route handlers thin and gives all endpoints the same validation
 * failure shape.
 */

const HttpItemIdPattern = /^itm_\d+$/

/**
 * `price` is a non-negative integer in minor currency units (cents), matching
 * the internal store and the seed dataset. Storing minor units as integers
 * avoids binary floating-point rounding; the CSV export renders them with two
 * decimals. Fractions here would silently disagree with the export (which
 * divides by 100), so they are rejected as a validation error.
 */
export const CreateItemSchema = z.object({
  name: z.string().trim().min(3, 'must be at least 3 characters').max(120),
  description: z.string().trim().max(500).optional(),
  category: z.enum(ITEM_CATEGORIES),
  price: z.number().int('must be a whole number of cents').min(0).max(100_000_000),
})

export const ItemIdParamSchema = z.object({
  id: z.string().min(4).max(64).regex(HttpItemIdPattern, 'must look like itm_<number>, e.g. itm_1'),
})

export const ListItemsQuerySchema = z.object({
  limit: z.coerce.number().int('must be an integer').min(1).max(100).default(20),
  offset: z.coerce.number().int('must be an integer').min(0).default(0),
  category: z.enum(ITEM_CATEGORIES).optional(),
})

export const GetItemQuerySchema = z.object({
  enrich: z
    .enum(['true', 'false', '1', '0'])
    .optional()
    .transform((value) => value === 'true' || value === '1'),
})

export type CreateItemPayload = z.infer<typeof CreateItemSchema>
export type ItemIdParam = z.infer<typeof ItemIdParamSchema>
export type ListItemsQuery = z.infer<typeof ListItemsQuerySchema>
export type GetItemQuery = z.infer<typeof GetItemQuerySchema>

/**
 * Parses `input` with `schema` or throws a ValidationError whose field issues
 * are prefixed with the input source (query / params / body) so API consumers
 * can tell exactly where the problem was.
 */
export function parseOrThrow<T extends z.ZodTypeAny>(
  schema: T,
  input: unknown,
  source: 'query' | 'params' | 'body' | 'enrich',
): z.infer<T> {
  const result = schema.safeParse(input)
  if (!result.success) {
    throw new ValidationError(zodIssuesToFieldIssues(result.error, source))
  }
  return result.data
}
