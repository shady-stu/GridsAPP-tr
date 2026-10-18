/**
 * Persistence contract for the webhook inbox.
 *
 * The interface is shaped around what the processor needs to do safely:
 *  * `insertIfAbsent` — idempotent accept, so a redelivered event is a no-op.
 *  * `claimBatch` / `reapExhaustedStale` — leasing and crash recovery.
 *  * `markProcessed` / `markFailed` / `markDeadLetter` — the only three terminal outcomes.
 *
 * `claimBatch` takes a staleness **duration in seconds**, not a `Date`. The reason is
 * timezone correctness: `webhook_events.processing_started_at` is a `timestamp(3)` holding UTC
 * wall time, so the boundary has to be computed in SQL as `now() AT TIME ZONE 'UTC'`. Passing a
 * JavaScript `Date` would introduce a dependency on the connection's session timezone.
 */
import { REPOSITORY_TOKENS } from '../../common/constants.js';
import type { WebhookEventStatus } from '../../generated/prisma/enums.js';
import type { WebhookEventRecord } from '../entities/webhook-event.entity.js';

export const WEBHOOK_EVENT_REPOSITORY = REPOSITORY_TOKENS.WEBHOOK_EVENT;

export interface InsertWebhookEventData {
  provider: string;
  providerEventId: string;
  eventType: string;
  payload: unknown;
  occurredAt: Date;
  maxAttempts: number;
}

export interface MarkFailedParams {
  error: string;
  nextAttemptAt: Date;
}

export interface WebhookEventRepository {
  /**
   * Insert the event, or return the existing row if `(provider, providerEventId)` is already
   * present. `created` tells the caller whether this was a first delivery, which is what makes
   * the HTTP response distinguish `202 Accepted` from `200 duplicate`.
   */
  insertIfAbsent(data: InsertWebhookEventData): Promise<{ created: boolean; record: WebhookEventRecord }>;

  /**
   * Atomically lease up to `limit` due events by flipping them to `PROCESSING` and incrementing
   * `attempts`. Rows already leased by another worker are skipped (`FOR UPDATE SKIP LOCKED`),
   * and a lease older than `staleAfterSeconds` is considered abandoned and may be re-claimed.
   */
  claimBatch(limit: number, staleAfterSeconds: number): Promise<WebhookEventRecord[]>;

  /**
   * Move abandoned leases whose attempt budget is exhausted to `DEAD_LETTER`.
   * Returns the number of rows reaped.
   */
  reapExhaustedStale(staleAfterSeconds: number): Promise<number>;

  markProcessed(id: string, tenantId: string | null): Promise<void>;

  markFailed(id: string, params: MarkFailedParams): Promise<void>;

  markDeadLetter(id: string, error: string): Promise<void>;

  findById(id: string): Promise<WebhookEventRecord | null>;

  /**
   * Counts per status. Pass `tenantId: null` to count events that could not be attributed to a
   * tenant yet (they are dead-lettered when the cause is permanent), and omit it for a global
   * count.
   */
  countByStatus(filter?: { tenantId?: string | null }): Promise<Record<WebhookEventStatus, number>>;
}
