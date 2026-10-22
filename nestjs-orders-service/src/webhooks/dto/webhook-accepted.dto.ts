/**
 * Acknowledgement returned to the provider for every accepted webhook.
 *
 * `status` distinguishes a first delivery (`accepted`, HTTP 202) from a redelivery
 * (`duplicate`, HTTP 200). Both are "success" from the provider's point of view, so both are
 * acknowledged without an error — that is what makes at-least-once delivery safe.
 */
import { ApiProperty } from '@nestjs/swagger';

export class WebhookAcceptedDto {
  @ApiProperty({ enum: ['accepted', 'duplicate'], example: 'accepted' })
  status!: 'accepted' | 'duplicate';

  @ApiProperty({ format: 'uuid', description: 'Internal id of the inbox row.' })
  eventId!: string;

  @ApiProperty({ description: 'Provider event id echoed back for correlation.' })
  providerEventId!: string;

  @ApiProperty({
    enum: ['RECEIVED', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD_LETTER'],
    description: 'Current processing state of the event.',
  })
  processingStatus!: string;

  @ApiProperty({
    example: false,
    description: 'True when this delivery created the inbox row (false = duplicate delivery).',
  })
  created!: boolean;
}
