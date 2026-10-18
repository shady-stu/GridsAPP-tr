/**
 * The "accept" half of webhook ingestion.
 *
 * Order of operations matters and is enforced here, not in the controller:
 *   1. verify the HMAC signature against the raw bytes,
 *   2. persist the event idempotently.
 *
 * Nothing is written before the signature is verified, so an unauthenticated caller cannot
 * create rows. Persisting *after* verification also means the inbox only ever contains events
 * the provider genuinely sent.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PAYMENT_WEBHOOK_PROVIDER } from '../common/constants.js';
import type { TypedConfigService } from '../config/configuration.js';
import type { WebhookEventRecord } from './entities/webhook-event.entity.js';
import { WEBHOOK_EVENT_REPOSITORY, type WebhookEventRepository } from './repositories/webhook-event.repository.js';
import { WebhookSignatureService } from './webhook-signature.service.js';
import type { PaymentWebhookEnvelopeDto } from './dto/payment-webhook.dto.js';
import type { WebhookEventStatus } from '../generated/prisma/enums.js';

export interface AcceptedWebhook {
  /** `true` when this delivery created the row; `false` for an idempotent redelivery. */
  created: boolean;
  event: WebhookEventRecord;
}

@Injectable()
export class WebhookInboxService {
  private readonly logger = new Logger(WebhookInboxService.name);

  constructor(
    @Inject(WEBHOOK_EVENT_REPOSITORY) private readonly events: WebhookEventRepository,
    private readonly signatures: WebhookSignatureService,
    private readonly config: TypedConfigService,
  ) {}

  async accept(params: {
    rawBody: Buffer | undefined;
    signatureHeader: string | string[] | undefined;
    envelope: PaymentWebhookEnvelopeDto;
  }): Promise<AcceptedWebhook> {
    this.signatures.verify(params.rawBody, params.signatureHeader);

    const { created, record } = await this.events.insertIfAbsent({
      provider: PAYMENT_WEBHOOK_PROVIDER,
      providerEventId: params.envelope.id,
      eventType: params.envelope.type,
      payload: params.envelope,
      occurredAt: new Date(params.envelope.occurredAt),
      maxAttempts: this.config.get('webhooks.maxAttempts', { infer: true }),
    });

    if (created) {
      this.logger.log(`Accepted ${params.envelope.type} event ${params.envelope.id}`);
    } else {
      this.logger.log(
        `Duplicate delivery of event ${params.envelope.id} (status ${record.status}); acknowledged`,
      );
    }

    return { created, event: record };
  }

  /**
   * Operational snapshot of the inbox for one tenant.
   *
   * `unresolved` counts events that have not been attributed to a tenant yet — they are counted
   * separately because scoping them to a tenant would either hide them (if filtered) or leak the
   * existence of other tenants' events (if not).
   */
  async summary(tenantId: string): Promise<WebhookEventSummary> {
    const [byStatus, unresolvedCounts] = await Promise.all([
      this.events.countByStatus({ tenantId }),
      this.events.countByStatus({ tenantId: null }),
    ]);

    const total = sumStatusCounts(byStatus);
    return {
      total,
      byStatus,
      unresolved: sumStatusCounts(unresolvedCounts),
    };
  }
}

export interface WebhookEventSummary {
  total: number;
  byStatus: Record<WebhookEventStatus, number>;
  unresolved: number;
}

function sumStatusCounts(counts: Record<WebhookEventStatus, number>): number {
  return Object.values(counts).reduce((total, count) => total + count, 0);
}
