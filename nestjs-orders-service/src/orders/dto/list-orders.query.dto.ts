/**
 * Query contract for `GET /orders`.
 *
 * `includeDeleted` is honoured only for `ADMIN` callers — the service drops it for everyone
 * else, so a `USER` cannot widen their view by adding a query parameter.
 */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsUUID } from 'class-validator';
import { PageQueryDto } from '../../common/dto/page-query.dto.js';
import { OrderStatus } from '../../generated/prisma/enums.js';

const ORDER_STATUS_VALUES = Object.values(OrderStatus) as string[];

export class ListOrdersQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ORDER_STATUS_VALUES, example: 'PENDING' })
  @IsOptional()
  @IsIn(ORDER_STATUS_VALUES, { message: `status must be one of: ${ORDER_STATUS_VALUES.join(', ')}` })
  status?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Only orders for this customer.' })
  @IsOptional()
  @IsUUID('4')
  customerId?: string;

  @ApiPropertyOptional({
    type: Boolean,
    example: false,
    description: 'ADMIN only. Include soft-deleted orders in the result.',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === 'true' || value === true) return true;
    if (value === 'false' || value === false) return false;
    return value;
  })
  @IsBoolean()
  includeDeleted?: boolean;
}
