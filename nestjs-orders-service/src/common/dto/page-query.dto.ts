/**
 * Shared query-string contract for every list endpoint.
 *
 * Query parameters arrive as strings, so each field is coerced with `class-transformer` and
 * then validated with `class-validator`. An out-of-range value is therefore a `400`
 * (`VALIDATION_FAILED`), never a silently clamped page — that behaviour is reserved for
 * `normalisePageRequest`, which only guards programmatic callers.
 */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { DEFAULT_PAGE, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '../utils/pagination.util.js';

export class PageQueryDto {
  @ApiPropertyOptional({
    description: '1-based page number.',
    example: 1,
    minimum: 1,
    default: DEFAULT_PAGE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = DEFAULT_PAGE;

  @ApiPropertyOptional({
    description: `Records per page (maximum ${MAX_PAGE_SIZE}).`,
    example: 20,
    minimum: 1,
    maximum: MAX_PAGE_SIZE,
    default: DEFAULT_PAGE_SIZE,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_PAGE_SIZE)
  pageSize: number = DEFAULT_PAGE_SIZE;
}
