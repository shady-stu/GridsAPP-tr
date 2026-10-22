/**
 * Request contract for partially updating a customer.
 *
 * Written out explicitly (rather than derived with `PartialType`) so the OpenAPI document and
 * the code agree at a glance — an intern reading this file sees exactly which fields a client
 * may change, and `email` keeps its normalising transform.
 */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { PHONE_PATTERN } from './create-customer.dto.js';

export class UpdateCustomerDto {
  @ApiPropertyOptional({ example: 'Ada Byron', minLength: 1, maxLength: 160 })
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name?: string;

  @ApiPropertyOptional({ example: 'ada@example.com', maxLength: 254 })
  @IsOptional()
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email?: string;

  @ApiPropertyOptional({ example: '+44 20 7946 0958', maxLength: 40, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(PHONE_PATTERN, { message: 'phone must be a valid phone number' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  phone?: string;

  @ApiPropertyOptional({ example: 'Prefers e-mail contact.', maxLength: 2000, nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({
    example: true,
    description:
      'Deactivate a customer instead of deleting them. Deactivated customers keep their orders ' +
      'and remain readable, but are excluded from `isActive=true` listings.',
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
