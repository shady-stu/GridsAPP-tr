/**
 * Domain view of a persisted webhook event (the durable "inbox" row).
 */
import type { WebhookEventStatus } from '../../generated/prisma/enums.js';

export interface WebhookEventRecord {
  readonly id: string;
  /** Provider identifier, e.g. `payments`. */
  readonly provider: string;
  /** Provider-side event id. Together with `provider` this is the idempotency key. */
  readonly providerEventId: string;
  readonly eventType: string;
  readonly status: WebhookEventStatus;
  /** Resolved during processing, from the verified payload. `null` until then. */
  readonly tenantId: string | null;
  /** The verified request body, stored verbatim for replay and forensics. */
  readonly payload: unknown;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly lastError: string | null;
  readonly occurredAt: Date;
  readonly nextAttemptAt: Date | null;
  readonly receivedAt: Date;
  readonly processingStartedAt: Date | null;
  readonly processedAt: Date | null;
}
