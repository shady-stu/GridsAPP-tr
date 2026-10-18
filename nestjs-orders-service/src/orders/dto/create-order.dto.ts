/**
 * Request contract for creating an order.
 *
 * Notes on the shape:
 *  * `customerId` must reference an **active customer inside the caller's tenant**; that check
 *    happens in the service because it needs a database lookup.
 *  * `totalAmount` is a decimal *string*. It is validated before normalisation so `"1.2.3"` or
 *    `"1e3"` is rejected rather than coerced.
 *  * `currency` is normalised to upper case and constrained to three letters, matching the
 *    `orders_currency_iso4217_check` database constraint.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';
import { MONEY_PATTERN } from '../../common/utils/money.util.js';

export class CreateOrderDto {
  @ApiProperty({
    format: 'uuid',
    description: 'Customer the order belongs to. Must be active and in the caller’s tenant.',
  })
  @IsUUID('4')
  customerId!: string;

  @ApiProperty({
    example: '199.90',
    description:
      'Non-negative amount as a decimal string with at most two decimal places. Never sent as a JSON number, so no floating-point rounding can occur.',
  })
  @IsString()
  @Matches(MONEY_PATTERN, {
    message: 'totalAmount must be a non-negative decimal string with up to 2 decimal places',
  })
  totalAmount!: string;

  @ApiProperty({ example: 'USD', minLength: 3, maxLength: 3 })
  @IsString()
  @Matches(/^[A-Za-z]{3}$/, { message: 'currency must be a three-letter ISO 4217 code' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  currency!: string;

  @ApiPropertyOptional({
    example: 'PO-2026-0042',
    maxLength: 64,
    description:
      'Merchant reference, unique per tenant among live (non-deleted) orders. Enforced by a partial unique index.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  reference?: string;

  @ApiPropertyOptional({ example: 'Deliver before Friday.', maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}
