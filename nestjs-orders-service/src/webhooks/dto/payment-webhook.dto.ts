/**
 * Request contract for a payment provider webhook.
 *
 * Design notes:
 *  * The envelope (`id`, `type`, `occurredAt`) is always required. `id` is the provider's event
 *    id and becomes the idempotency key; `occurredAt` is the provider's clock, stored separately
 *    from our `received_at`.
 *  * `data` is optional at this layer. Whether it is *sufficient* depends on `type`, which the
 *    handler decides — that keeps the DTO honest about unknown/forward-compatible event types
 *    instead of rejecting them at the edge.
 *  * This route disables `whitelist` on the validation pipe (see `WebhooksController`) so that
 *    unknown provider fields are preserved in the stored payload.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MONEY_PATTERN } from '../../common/utils/money.util.js';

/** Event types this service knows how to apply. Unknown types are accepted, then dead-lettered. */
export const PAYMENT_WEBHOOK_EVENT_TYPES = [
  'payment.succeeded',
  'payment.refunded',
  'payment.failed',
] as const;

export type PaymentWebhookEventType = (typeof PAYMENT_WEBHOOK_EVENT_TYPES)[number];

export class PaymentWebhookDataDto {
  @ApiPropertyOptional({ format: 'uuid', description: 'The order this event refers to.' })
  @IsOptional()
  @IsUUID('4')
  orderId?: string;

  @ApiPropertyOptional({ example: '199.90', description: 'Amount as a decimal string.' })
  @IsOptional()
  @IsString()
  @Matches(MONEY_PATTERN, { message: 'data.amount must be a decimal string with up to 2 decimals' })
  amount?: string;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{3}$/, { message: 'data.currency must be a three-letter code' })
  currency?: string;

  @ApiPropertyOptional({ example: 'ch_3PxY2k2eZvKYlo2C' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  providerReference?: string;
}

export class PaymentWebhookEnvelopeDto {
  @ApiProperty({
    example: 'evt_01J8Z3K9YV4F9T2QW1S7X6B5NC',
    description: 'Provider event id. Used as the idempotency key.',
    maxLength: 200,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  id!: string;

  @ApiProperty({
    example: 'payment.succeeded',
    description: `One of ${PAYMENT_WEBHOOK_EVENT_TYPES.join(', ')}, or any other value (accepted and dead-lettered).`,
    maxLength: 100,
  })
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  type!: string;

  @ApiProperty({
    format: 'date-time',
    example: '2026-01-01T12:00:00.000Z',
    description: 'When the provider generated the event (ISO 8601).',
  })
  @IsDateString()
  occurredAt!: string;

  @ApiPropertyOptional({ type: PaymentWebhookDataDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentWebhookDataDto)
  data?: PaymentWebhookDataDto;
}
