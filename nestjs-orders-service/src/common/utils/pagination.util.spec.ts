/**
 * Unit tests for pagination normalisation.
 *
 * Two layers exist on purpose: the query DTO *rejects* out-of-range input with a 400, while
 * `normalisePageRequest` *clamps* it for programmatic callers (services, tests). These tests pin
 * the clamping behaviour so the two layers cannot silently converge.
 */
import { describe, expect, it } from 'vitest';
import { toPaginatedResult } from '../interfaces/pagination.interface.js';
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  normalisePageRequest,
  toSkipTake,
} from './pagination.util.js';

describe('normalisePageRequest', () => {
  it('falls back to documented defaults when nothing is provided', () => {
    expect(normalisePageRequest()).toEqual({ page: DEFAULT_PAGE, pageSize: DEFAULT_PAGE_SIZE });
    expect(normalisePageRequest({})).toEqual({ page: DEFAULT_PAGE, pageSize: DEFAULT_PAGE_SIZE });
  });

  it('parses numeric strings, as they arrive from a query string', () => {
    expect(normalisePageRequest({ page: '3', pageSize: '50' })).toEqual({ page: 3, pageSize: 50 });
  });

  it('clamps a page below 1 up to 1', () => {
    expect(normalisePageRequest({ page: 0 }).page).toBe(1);
    expect(normalisePageRequest({ page: -5 }).page).toBe(1);
  });

  it('clamps pageSize into the allowed range', () => {
    expect(normalisePageRequest({ pageSize: 0 }).pageSize).toBe(1);
    expect(normalisePageRequest({ pageSize: MAX_PAGE_SIZE + 1 }).pageSize).toBe(MAX_PAGE_SIZE);
  });

  it('falls back for values that are not finite numbers', () => {
    expect(normalisePageRequest({ page: 'abc', pageSize: 'xyz' })).toEqual({
      page: DEFAULT_PAGE,
      pageSize: DEFAULT_PAGE_SIZE,
    });
    expect(normalisePageRequest({ page: Number.NaN }).page).toBe(DEFAULT_PAGE);
  });

  it('truncates fractional values', () => {
    expect(normalisePageRequest({ page: 2.9, pageSize: 10.7 })).toEqual({ page: 2, pageSize: 10 });
  });

  it('treats null the same as undefined', () => {
    expect(normalisePageRequest({ page: null, pageSize: null })).toEqual({
      page: DEFAULT_PAGE,
      pageSize: DEFAULT_PAGE_SIZE,
    });
  });
});

describe('toSkipTake', () => {
  it('translates a 1-based page into an offset', () => {
    expect(toSkipTake({ page: 1, pageSize: 20 })).toEqual({ skip: 0, take: 20 });
    expect(toSkipTake({ page: 3, pageSize: 20 })).toEqual({ skip: 40, take: 20 });
  });
});

describe('toPaginatedResult', () => {
  it('computes totalPages and hasNextPage', () => {
    const result = toPaginatedResult(['a', 'b'], 5, { page: 1, pageSize: 2 });
    expect(result).toEqual({
      items: ['a', 'b'],
      total: 5,
      page: 1,
      pageSize: 2,
      totalPages: 3,
      hasNextPage: true,
    });
  });

  it('reports no next page on the last page', () => {
    expect(toPaginatedResult(['e'], 5, { page: 3, pageSize: 2 }).hasNextPage).toBe(false);
  });

  it('reports zero pages for an empty result set', () => {
    expect(toPaginatedResult([], 0, { page: 1, pageSize: 20 }).totalPages).toBe(0);
  });
});
