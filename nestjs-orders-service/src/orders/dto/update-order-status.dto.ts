/**
 * Request contract for a manual status change.
 *
 * Only `ADMIN` may use this endpoint: the ordinary way an order moves forward is a verified
 * payment webhook. Manual transitions exist for support/back-office corrections and are
 * recorded in the audit trail with a mandatory-optional `reason`.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { OrderStatus } from '../../generated/prisma/enums.js';

const ORDER_STATUS_VALUES = Object.values(OrderStatus) as string[];

export class UpdateOrderStatusDto {
  @ApiProperty({
    enum: ORDER_STATUS_VALUES,
    example: 'PAID',
    description: 'Target status. Must be reachable from the current status.',
  })
  @IsIn(ORDER_STATUS_VALUES, {
    message: `status must be one of: ${ORDER_STATUS_VALUES.join(', ')}`,
  })
  status!: string;

  @ApiPropertyOptional({
    example: 'Confirmed by bank transfer reference 8842.',
    maxLength: 500,
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
