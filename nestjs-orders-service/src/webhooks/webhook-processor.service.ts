/**
 * The background processor: turns accepted inbox rows into applied business operations.
 *
 * Why a database-backed poller instead of a queue (BullMQ/Redis)?
 *  * The event and the business change already have to be transactionally consistent with
 *    PostgreSQL. Adding a second datastore would mean solving distributed delivery on top of the
 *    problem we are trying to solve.
 *  * `FOR UPDATE SKIP LOCKED` gives horizontal safety for free: several app instances can poll
 *    the same table without any coordination, and each row is leased by exactly one of them.
 *  * It keeps the demo/CI story to a single dependency (PostgreSQL) — no broker to run.
 *
 * The trade-off, stated honestly: throughput is bounded by the poll interval and the batch size,
 * and there is no push-based latency guarantee. For a payments webhook at this scale that is a
 * good trade; `docs/ARCHITECTURE.md` records the reasoning and the migration path.
 *
 * Reliability properties:
 *  * **At-least-once**: a claimed row is only completed when the handler succeeds; a crash
 *    leaves a stale `PROCESSING` lease that another tick re-claims.
 *  * **Idempotent**: the handler tolerates "already in the target state" and the event table's
 *    unique key prevents duplicate work in the first place.
 *  * **Bounded**: attempts are capped; exhausted events become `DEAD_LETTER`, never an infinite
 *    retry loop.
 *  * **Non-overlapping**: `processOnce` is guarded so a slow batch cannot be started twice.
 */
import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { TypedConfigService } from '../config/configuration.js';
import type { WebhookEventRecord } from './entities/webhook-event.entity.js';
import { PaymentWebhookHandler } from './payment-webhook.handler.js';
import {
  WEBHOOK_EVENT_REPOSITORY,
  type WebhookEventRepository,
} from './repositories/webhook-event.repository.js';
import { describeWebhookError, isPermanentWebhookError } from './webhook-errors.js';

/** Upper bound for the exponential backoff, so a long outage cannot push a retry a week out. */
const MAX_BACKOFF_MS = 3_600_000;

@Injectable()
export class WebhookProcessorService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(WebhookProcessorService.name);
  private timer?: NodeJS.Timeout;
  /** Guards against overlapping ticks when one batch takes longer than the poll interval. */
  private running = false;

  constructor(
    @Inject(WEBHOOK_EVENT_REPOSITORY) private readonly events: WebhookEventRepository,
    private readonly handler: PaymentWebhookHandler,
    private readonly config: TypedConfigService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.get('webhooks.processingEnabled', { infer: true })) {
      this.logger.warn('Webhook processing is disabled (WEBHOOK_PROCESSING_ENABLED=false)');
      return;
    }

    const intervalMs = this.config.get('webhooks.pollIntervalMs', { infer: true });
    this.timer = setInterval(() => {
      void this.tick();
    }, intervalMs);
    // Do not let the poll timer keep the process alive on its own.
    this.timer.unref();
    this.logger.log(`Webhook processor started (every ${intervalMs}ms)`);
  }

  onApplicationShutdown(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
      this.logger.log('Webhook processor stopped');
    }
  }

  /**
   * Run one processing pass and return how many events were handled.
   *
   * Public and free of timers so tests can drive it deterministically instead of waiting for the
   * poll interval. The admin-only `POST /webhooks/events/process` endpoint uses the same method.
   */
  async processOnce(): Promise<number> {
    const staleAfterMs = this.config.get('webhooks.processingStaleAfterMs', { infer: true });
    const staleAfterSeconds = staleAfterMs / 1_000;
    const batchSize = this.config.get('webhooks.batchSize', { infer: true });

    // Recover events whose worker died after exhausting its attempts; without this they would
    // stay in PROCESSING forever.
    const reaped = await this.events.reapExhaustedStale(staleAfterSeconds);
    if (reaped > 0) {
      this.logger.warn(`Reaped ${reaped} abandoned webhook event(s) into DEAD_LETTER`);
    }

    const claimed = await this.events.claimBatch(batchSize, staleAfterSeconds);
    for (const event of claimed) {
      await this.applyEvent(event);
    }
    return claimed.length;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.processOnce();
    } catch (error) {
      // A failure here means the *inbox* is unhealthy (e.g. database down). Log and let the next
      // tick retry; never let it become an unhandled rejection.
      this.logger.error(`Webhook processing pass failed: ${describeWebhookError(error)}`);
    } finally {
      this.running = false;
    }
  }

  private async applyEvent(event: WebhookEventRecord): Promise<void> {
    try {
      const outcome = await this.handler.handle(event);
      await this.events.markProcessed(event.id, outcome.tenantId);
      this.logger.log(`Event ${event.providerEventId} processed (${outcome.note})`);
    } catch (error) {
      await this.recordFailure(event, error);
    }
  }

  private async recordFailure(event: WebhookEventRecord, error: unknown): Promise<void> {
    const message = describeWebhookError(error);
    const permanent = isPermanentWebhookError(error);
    const exhausted = permanent || event.attempts >= event.maxAttempts;

    if (exhausted) {
      await this.events.markDeadLetter(
        event.id,
        permanent
          ? `Permanent failure: ${message}`
          : `Gave up after ${event.attempts} attempt(s): ${message}`,
      );
      this.logger.error(
        `Event ${event.providerEventId} moved to DEAD_LETTER after ${event.attempts} attempt(s): ${message}`,
      );
      return;
    }

    const delayMs = this.backoffMs(event.attempts);
    await this.events.markFailed(event.id, {
      error: message,
      nextAttemptAt: new Date(Date.now() + delayMs),
    });
    this.logger.warn(
      `Event ${event.providerEventId} attempt ${event.attempts}/${event.maxAttempts} failed; retrying in ${delayMs}ms: ${message}`,
    );
  }

  /** Exponential backoff: base, 2x base, 4x base, ... capped. */
  private backoffMs(attempts: number): number {
    const base = this.config.get('webhooks.retryBackoffBaseMs', { infer: true });
    const multiplier = 2 ** Math.max(0, attempts - 1);
    return Math.min(base * multiplier, MAX_BACKOFF_MS);
  }
}
