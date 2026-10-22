/**
 * Reusable OpenAPI schema for the uniform error envelope.
 *
 * Declared as a DTO (instead of an inline Swagger literal) so it can be referenced from every
 * `@ApiXxxResponse({ type: ApiErrorBodyDto })` and therefore appears once in the generated
 * document, keeping `/docs` an accurate reflection of the implementation.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ERROR_CODES } from '../interfaces/api-error.interface.js';

/** One field-level validation problem. */
export class ApiErrorDetailDto {
  @ApiProperty({
    type: String,
    nullable: true,
    example: 'totalAmount',
    description: 'Dotted path of the offending field, or null for whole-request problems.',
  })
  field!: string | null;

  @ApiProperty({ example: 'totalAmount must not be less than 0' })
  message!: string;
}

export class ApiErrorBodyDto {
  @ApiProperty({ example: 400 })
  statusCode!: number;

  @ApiProperty({ example: 'Bad Request' })
  error!: string;

  @ApiProperty({ example: 'Request validation failed' })
  message!: string;

  @ApiProperty({
    description:
      'Correlation id of the request. Echoed in the `x-request-id` response header and in the logs.',
    example: '0f8fad5b-d9cb-469f-a165-70867728950e',
  })
  requestId!: string;

  @ApiProperty({
    enum: Object.values(ERROR_CODES),
    example: ERROR_CODES.VALIDATION_FAILED,
    description: 'Stable machine-readable code. Use this instead of parsing `message`.',
  })
  errorCode!: string;

  @ApiPropertyOptional({ type: [ApiErrorDetailDto] })
  details?: ApiErrorDetailDto[];

  @ApiProperty({ format: 'date-time' })
  timestamp!: string;

  @ApiProperty({ example: '/api/v1/orders' })
  path!: string;
}
