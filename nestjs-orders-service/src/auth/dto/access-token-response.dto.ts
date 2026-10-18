/**
 * Login response contract: the issued access token and its metadata.
 * The refresh-token flow is intentionally out of scope for this training project and is
 * called out as a limitation in README ("Known limitations").
 */
import { ApiProperty } from '@nestjs/swagger';

export class AccessTokenResponseDto {
  @ApiProperty({
    description: 'HS256-signed JWT. Send it as `Authorization: Bearer <accessToken>`.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI...',
  })
  accessToken!: string;

  @ApiProperty({ enum: ['Bearer'], example: 'Bearer' })
  tokenType!: 'Bearer';

  @ApiProperty({ description: 'Lifetime in seconds.', example: 3600 })
  expiresIn!: number;

  @ApiProperty({ format: 'date-time', example: '2026-01-01T13:00:00.000Z' })
  expiresAt!: string;
}
