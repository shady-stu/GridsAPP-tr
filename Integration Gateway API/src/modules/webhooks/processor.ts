import type { Db } from "../../database.js";
import { paymentStatusEventSchema } from "./schemas.js";

export interface WebhookProcessorOptions {
  db: Db;
  now?: () => string;
  epoch?: () => number;
  maxAttempts: number;
}

/** Create the database-backed event processor used both by the worker and integration tests. */
export function createWebhookProcessor({
  db,
  now = () => new Date().toISOString(),
  epoch = Date.now,
  maxAttempts,
}: WebhookProcessorOptions): () => Promise<void> {
  return async function processPendingEvents(): Promise<void> {
    const pending = db
      .prepare(
        "SELECT * FROM webhook_events WHERE status IN ('pending','failed') AND next_attempt_at<=? AND attempts<? ORDER BY received_at LIMIT 50",
      )
      .all(epoch(), maxAttempts);

    for (const row of pending) {
      const eventRow = row as Record<string, unknown>;
      const eventId = String(eventRow.event_id);
      const attempt = Number(eventRow.attempts) + 1;
      try {
        const event = paymentStatusEventSchema.parse(
          JSON.parse(String(eventRow.payload_json)),
        );
        // Business change and processed marker must commit together to close the crash window.
        db.transaction(() => {
          const changed = db
            .prepare("UPDATE orders SET status=?,updated_at=? WHERE id=?")
            .run(event.data.status, now(), event.data.orderId);
          if (!changed.changes) throw new Error("Referenced order not found");
          db.prepare(
            "UPDATE webhook_events SET status='processed',attempts=?,processed_at=?,last_error=NULL WHERE event_id=?",
          ).run(attempt, now(), eventId);
        })();
      } catch (error) {
        const nextAttempt =
          epoch() + Math.min(60_000, 1000 * 2 ** (attempt - 1));
        const deadLetter = attempt >= maxAttempts;
        db.prepare(
          "UPDATE webhook_events SET status=?,attempts=?,next_attempt_at=?,last_error=? WHERE event_id=?",
        ).run(
          deadLetter ? "dead_letter" : "failed",
          attempt,
          nextAttempt,
          error instanceof Error ? error.message : "Processing failed",
          eventId,
        );
      }
    }
  };
}
