/**
 * Prisma-backed webhook inbox.
 *
 * Three statements here use raw SQL on purpose:
 *
 *  1. `claimBatch` — needs `FOR UPDATE SKIP LOCKED` and `LIMIT` in one statement, which is the
 *     canonical PostgreSQL job-queue lease and has no Prisma Client equivalent.
 *  2. `reapExhaustedStale` — a conditional bulk update that Prisma can express, but as two round
 *     trips; the raw form keeps it atomic.
 *  3. Both of the above compare against `timestamp(3)` columns, which hold **UTC wall time**
 *     (Prisma always reads and writes DateTime as UTC). Every comparison therefore uses
 *     `now() AT TIME ZONE 'UTC'`; a bare `now()` would silently shift by the session timezone.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { Prisma } from '../../generated/prisma/client.js';
import type { WebhookEvent } from '../../generated/prisma/client.js';
// `enums.ts` exports the same name as both a value map and a union type, so one import covers
// `WebhookEventStatus.PROCESSED` (value) and `Record<WebhookEventStatus, number>` (type).
import { WebhookEventStatus } from '../../generated/prisma/enums.js';
import type { WebhookEventRecord } from '../entities/webhook-event.entity.js';
import type {
  InsertWebhookEventData,
  MarkFailedParams,
  WebhookEventRepository,
} from './webhook-event.repository.js';

/** PostgreSQL's `unique_violation`. */
const UNIQUE_VIOLATION = 'P2002';

@Injectable()
export class PrismaWebhookEventRepository implements WebhookEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  async insertIfAbsent(
    data: InsertWebhookEventData,
  ): Promise<{ created: boolean; record: WebhookEventRecord }> {
    try {
      const row = await this.prisma.webhookEvent.create({
        data: {
          provider: data.provider,
          providerEventId: data.providerEventId,
          eventType: data.eventType,
          payload: data.payload as Prisma.InputJsonValue,
          occurredAt: data.occurredAt,
          maxAttempts: data.maxAttempts,
          status: WebhookEventStatus.RECEIVED,
        },
      });
      return { created: true, record: toWebhookEventRecord(row) };
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;

      // Lost the race (or a genuine redelivery): load the row that won.
      const existing = await this.prisma.webhookEvent.findUnique({
        where: {
          provider_providerEventId: {
            provider: data.provider,
            providerEventId: data.providerEventId,
          },
        },
      });
      if (!existing) throw error;
      return { created: false, record: toWebhookEventRecord(existing) };
    }
  }

  async claimBatch(limit: number, staleAfterSeconds: number): Promise<WebhookEventRecord[]> {
    const claimed = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      UPDATE "webhook_events"
      SET "status" = 'PROCESSING',
          "processing_started_at" = (now() AT TIME ZONE 'UTC'),
          "attempts" = "attempts" + 1,
          "last_error" = NULL
      WHERE "id" IN (
        SELECT "id"
        FROM "webhook_events"
        WHERE "attempts" < "max_attempts"
          AND (
            (
              "status" IN ('RECEIVED', 'FAILED')
              AND ("next_attempt_at" IS NULL OR "next_attempt_at" <= (now() AT TIME ZONE 'UTC'))
            )
            OR (
              -- An abandoned lease: the previous worker died mid-flight.
              "status" = 'PROCESSING'
              AND "processing_started_at" <
                  (now() AT TIME ZONE 'UTC') - make_interval(secs => ${staleAfterSeconds}::double precision)
            )
          )
        ORDER BY "received_at" ASC
        LIMIT ${limit}::int
        FOR UPDATE SKIP LOCKED
      )
      RETURNING "id"
    `);

    if (claimed.length === 0) return [];

    const rows = await this.prisma.webhookEvent.findMany({
      where: { id: { in: claimed.map((entry) => entry.id) } },
      orderBy: [{ receivedAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toWebhookEventRecord);
  }

  async reapExhaustedStale(staleAfterSeconds: number): Promise<number> {
    return this.prisma.$executeRaw(Prisma.sql`
      UPDATE "webhook_events"
      SET "status" = 'DEAD_LETTER',
          "processed_at" = (now() AT TIME ZONE 'UTC'),
          "processing_started_at" = NULL,
          "next_attempt_at" = NULL,
          "last_error" = COALESCE(
            "last_error",
            'Processing was abandoned and the attempt budget is exhausted'
          )
      WHERE "status" = 'PROCESSING'
        AND "attempts" >= "max_attempts"
        AND "processing_started_at" <
            (now() AT TIME ZONE 'UTC') - make_interval(secs => ${staleAfterSeconds}::double precision)
    `);
  }

  async markProcessed(id: string, tenantId: string | null): Promise<void> {
    await this.prisma.webhookEvent.updateMany({
      where: { id },
      data: {
        status: WebhookEventStatus.PROCESSED,
        tenantId,
        processedAt: new Date(),
        processingStartedAt: null,
        nextAttemptAt: null,
        lastError: null,
      },
    });
  }

  async markFailed(id: string, params: MarkFailedParams): Promise<void> {
    await this.prisma.webhookEvent.updateMany({
      where: { id },
      data: {
        status: WebhookEventStatus.FAILED,
        lastError: truncateError(params.error),
        nextAttemptAt: params.nextAttemptAt,
        processingStartedAt: null,
      },
    });
  }

  async markDeadLetter(id: string, error: string): Promise<void> {
    await this.prisma.webhookEvent.updateMany({
      where: { id },
      data: {
        status: WebhookEventStatus.DEAD_LETTER,
        lastError: truncateError(error),
        processedAt: new Date(),
        processingStartedAt: null,
        nextAttemptAt: null,
      },
    });
  }

  async findById(id: string): Promise<WebhookEventRecord | null> {
    const row = await this.prisma.webhookEvent.findUnique({ where: { id } });
    return row ? toWebhookEventRecord(row) : null;
  }

  async countByStatus(filter: { tenantId?: string | null } = {}): Promise<Record<WebhookEventStatus, number>> {
    const grouped = await this.prisma.webhookEvent.groupBy({
      by: ['status'],
      _count: { _all: true },
      where: filter.tenantId === undefined ? {} : { tenantId: filter.tenantId },
    });

    const counts = emptyStatusCounts();
    for (const entry of grouped) {
      counts[entry.status] = entry._count._all;
    }
    return counts;
  }
}

function emptyStatusCounts(): Record<WebhookEventStatus, number> {
  return {
    RECEIVED: 0,
    PROCESSING: 0,
    PROCESSED: 0,
    FAILED: 0,
    DEAD_LETTER: 0,
  };
}

/** Error text is persisted for operators; cap it so a huge stack cannot bloat the row. */
function truncateError(error: string): string {
  return error.length > 2000 ? `${error.slice(0, 1997)}...` : error;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}

export function toWebhookEventRecord(row: WebhookEvent): WebhookEventRecord {
  return {
    id: row.id,
    provider: row.provider,
    providerEventId: row.providerEventId,
    eventType: row.eventType,
    status: row.status,
    tenantId: row.tenantId,
    payload: row.payload,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    lastError: row.lastError,
    occurredAt: row.occurredAt,
    nextAttemptAt: row.nextAttemptAt,
    receivedAt: row.receivedAt,
    processingStartedAt: row.processingStartedAt,
    processedAt: row.processedAt,
  };
}
