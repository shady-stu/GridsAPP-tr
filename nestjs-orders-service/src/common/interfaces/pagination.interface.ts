import { ApiProperty } from '@nestjs/swagger';

/**
 * Offset pagination primitives shared by every list endpoint.
 *
 * A single `PaginatedResult<T>` shape keeps API responses predictable and lets the
 * repositories return both the page and the total count from one transaction.
 */
export interface PageRequest {
  readonly page: number;
  readonly pageSize: number;
}

export interface PaginatedResult<T> {
  readonly items: T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
  readonly totalPages: number;
  readonly hasNextPage: boolean;
}

export function toPaginatedResult<T>(items: T[], total: number, request: PageRequest): PaginatedResult<T> {
  const totalPages = request.pageSize > 0 ? Math.ceil(total / request.pageSize) : 0;
  return {
    items,
    total,
    page: request.page,
    pageSize: request.pageSize,
    totalPages,
    hasNextPage: request.page < totalPages,
  };
}

/** Concrete, Swagger-friendly envelope produced for `PaginatedResult<T>` responses. */
export class PaginationMetaDto {
  @ApiProperty({ example: 42, description: 'Total number of matching records.' })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;

  @ApiProperty({ example: true })
  hasNextPage!: boolean;
}

/**
 * Splits a `PaginatedResult<T>` into its metadata and mapped items.
 * Concrete per-resource envelopes (see `OrderPageDto`) use this to build their response.
 */
export function toPageMeta<T>(result: PaginatedResult<T>): PaginationMetaDto {
  return {
    total: result.total,
    page: result.page,
    pageSize: result.pageSize,
    totalPages: result.totalPages,
    hasNextPage: result.hasNextPage,
  };
}
