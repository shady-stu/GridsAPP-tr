/**
 * Base class for paginated response envelopes.
 *
 * A concrete subclass per resource (see `OrderPageDto`) is used rather than a generic class so
 * that the generated OpenAPI document shows real schemas instead of unresolved type variables.
 */
import { ApiProperty } from '@nestjs/swagger';
import type { PaginatedResult } from '../interfaces/pagination.interface.js';

export class PaginatedResponseDto {
  @ApiProperty({ example: 42, description: 'Total number of matching records.' })
  total!: number;

  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  pageSize!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;

  @ApiProperty({ example: true, description: 'True when there is at least one page after this one.' })
  hasNextPage!: boolean;

  /** Copies page metadata onto a concrete envelope. Used by the per-resource `from` helpers. */
  protected static copyMeta(
    target: PaginatedResponseDto,
    result: PaginatedResult<unknown>,
  ): void {
    target.total = result.total;
    target.page = result.page;
    target.pageSize = result.pageSize;
    target.totalPages = result.totalPages;
    target.hasNextPage = result.hasNextPage;
  }
}
