/**
 * Pagination helpers shared by query DTOs and repositories.
 *
 * The DTOs already validate `page`/`pageSize` with `class-validator`; these functions
 * normalise the values into the `PageRequest` the repository ports accept, so the
 * persistence layer never sees `undefined` or out-of-range input.
 */
import type { PageRequest } from '../interfaces/pagination.interface.js';

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export interface RawPageQuery {
  page?: number | string | null;
  pageSize?: number | string | null;
}

export function normalisePageRequest(query: RawPageQuery = {}): PageRequest {
  const page = toPositiveInt(query.page, DEFAULT_PAGE, 1, Number.MAX_SAFE_INTEGER);
  const pageSize = toPositiveInt(query.pageSize, DEFAULT_PAGE_SIZE, 1, MAX_PAGE_SIZE);
  return { page, pageSize };
}

export function toSkipTake(request: PageRequest): { skip: number; take: number } {
  return { skip: (request.page - 1) * request.pageSize, take: request.pageSize };
}

function toPositiveInt(
  value: number | string | null | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  // Checked before coercion: `Number(null)` is `0`, which would silently clamp to `min` instead of
  // falling back to the documented default.
  if (value === null || value === undefined) return fallback;

  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const truncated = Math.trunc(parsed);
  if (truncated < min) return min;
  if (truncated > max) return max;
  return truncated;
}
