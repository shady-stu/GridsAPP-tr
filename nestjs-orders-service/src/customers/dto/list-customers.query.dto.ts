/**
 * Query contract for `GET /customers`.
 *
 * `isActive` is a tri-state filter: omitted means "any". Because query strings are text, the
 * value is coerced by `class-transformer` and then validated as a real boolean, so
 * `?isActive=maybe` is a 400 rather than being silently treated as `true`.
 */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import { PageQueryDto } from '../../common/dto/page-query.dto.js';

export class ListCustomersQueryDto extends PageQueryDto {
  @ApiPropertyOptional({
    description: 'Case-insensitive substring match against name or e-mail.',
    example: 'ada',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  search?: string;

  @ApiPropertyOptional({
    description: 'Filter by active flag. Omit to include both active and deactivated customers.',
    example: true,
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  isActive?: boolean;
}
