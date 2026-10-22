/**
 * Request contract for creating a customer.
 *
 * `Transform` normalises values *before* validation, so `  Ada@Example.COM ` is stored as
 * `ada@example.com` and the per-tenant unique index behaves predictably.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** Permissive but structurally meaningful: digits, spaces and the usual separators. */
export const PHONE_PATTERN = /^\+?[0-9][0-9 ()\-.]{2,39}$/;

export class CreateCustomerDto {
  @ApiProperty({ example: 'Ada Lovelace', minLength: 1, maxLength: 160 })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  name!: string;

  @ApiProperty({ example: 'ada@example.com', maxLength: 254 })
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

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
}
