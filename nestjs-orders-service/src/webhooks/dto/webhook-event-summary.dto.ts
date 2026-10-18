/**
 * Operational snapshot of a tenant's webhook inbox.
 *
 * Exists so that "are we behind?" and "did anything dead-letter?" are answerable from the API
 * without database access — the minimum viable alternative to a hosted queue's dashboard.
 */
import { ApiProperty } from '@nestjs/swagger';
import { WebhookEventStatus } from '../../generated/prisma/enums.js';
import type { WebhookEventSummary } from '../webhook-inbox.service.js';

export class WebhookEventStatusCountsDto {
  @ApiProperty({ example: 0, description: 'Waiting to be picked up.' })
  RECEIVED!: number;

  @ApiProperty({ example: 0, description: 'Currently leased by a worker.' })
  PROCESSING!: number;

  @ApiProperty({ example: 12 })
  PROCESSED!: number;

  @ApiProperty({ example: 0, description: 'Failed but will be retried.' })
  FAILED!: number;

  @ApiProperty({ example: 0, description: 'Gave up (or failed permanently). Needs attention.' })
  DEAD_LETTER!: number;

  static from(counts: Record<WebhookEventStatus, number>): WebhookEventStatusCountsDto {
    return { ...counts };
  }
}

export class WebhookEventSummaryDto {
  @ApiProperty({ example: 12, description: 'Total events attributed to this tenant.' })
  total!: number;

  @ApiProperty({ type: WebhookEventStatusCountsDto })
  byStatus!: WebhookEventStatusCountsDto;

  @ApiProperty({
    example: 0,
    description:
      'Events that could not be attributed to a tenant (missing order, unknown event type). ' +
      'They are not tenant-scoped, so they are reported separately.',
  })
  unresolved!: number;

  static from(summary: WebhookEventSummary): WebhookEventSummaryDto {
    return {
      total: summary.total,
      byStatus: WebhookEventStatusCountsDto.from(summary.byStatus),
      unresolved: summary.unresolved,
    };
  }
}
