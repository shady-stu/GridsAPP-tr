/**
 * Login request contract.
 *
 * `tenantSlug` is required and explicit: identities are unique per tenant, so requiring the
 * tenant removes the "which account did they mean?" ambiguity and keeps the endpoint from
 * leaking whether an email exists in some other tenant.
 */
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'URL-safe identifier of the tenant the user belongs to.',
    example: 'acme',
    minLength: 2,
    maxLength: 60,
  })
  @IsString()
  @MinLength(2)
  @MaxLength(60)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'tenantSlug must be lowercase alphanumeric with single hyphens',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  tenantSlug!: string;

  @ApiProperty({ example: 'admin@acme.test', maxLength: 254 })
  @IsEmail()
  @MaxLength(254)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email!: string;

  @ApiProperty({
    description: 'Plaintext password. Only ever compared against a scrypt digest; never stored or logged.',
    example: 'Passw0rd!demo',
    minLength: 8,
    maxLength: 128,
    writeOnly: true,
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
