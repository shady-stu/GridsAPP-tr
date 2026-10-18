/**
 * Request contract for non-financial edits to an order.
 *
 * `customerId`, `totalAmount` and `currency` are intentionally absent: changing the value of an
 * order that has already been paid would invalidate the payment record and the audit trail.
 * A wrong amount is corrected by cancelling and creating a new order.
 */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateOrderDto {
  @ApiPropertyOptional({ example: 'PO-2026-0042', maxLength: 64, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  reference?: string;

  @ApiPropertyOptional({ example: 'Deliver before Friday.', maxLength: 2000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
