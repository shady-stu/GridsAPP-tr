# Payment webhook runbook

## Delivery flow

The receiver checks required signature headers and timestamp freshness, verifies HMAC against the exact raw body, validates the event schema, and inserts the event ID and body into `webhook_events`. Only after the insert succeeds does it acknowledge with `202`. Duplicate event IDs return `200` without creating another event row. An unref'ed worker polls persisted `pending` and due `failed` rows, applies the order status update, and marks work processed.

## Signature validation

The sender supplies `X-Webhook-Timestamp` as 10-digit Unix seconds and `X-Webhook-Signature` as `sha256=<64 lowercase hexadecimal characters>`. The digest is HMAC-SHA256 over `<timestamp>.<exact UTF-8 raw body>`. The default acceptance tolerance is 300 seconds. Never sign a parsed/reserialized object: whitespace and property order affect the digest. The application caps request bodies at 1 MB and uses constant-time digest comparison.

## Duplicates, retries, and dead letters

`event_id` is the primary key, so unique event IDs are only accepted once. The worker retries a failed business action with exponential delays (1, 2, 4, 8 seconds, capped at 60 seconds) and stops at `WEBHOOK_MAX_ATTEMPTS` (default 5). Exhausted work is marked `dead_letter`, with attempt count and last error recorded. The current failure path is demonstrated by an event referring to an unknown order.

Inspect rows with SQLite, for example:

```sql
SELECT event_id, status, attempts, next_attempt_at, last_error, received_at
FROM webhook_events ORDER BY received_at DESC;
```

Investigate the referenced order and event payload, check database availability and API logs, then correct the underlying issue before replay. Do not edit event JSON to make a signature valid; signature verification already happened at receipt and the stored payload is trusted only as a persisted accepted event. Manual replay should reset only an operator-reviewed dead-letter row to `pending`, set `next_attempt_at` to the current epoch milliseconds, then observe its status and order update. Example:

```sql
UPDATE webhook_events SET status='pending', next_attempt_at=unixepoch('subsec')*1000, attempts=0, last_error=NULL WHERE event_id='evt_reviewed';
```

The event key remains reserved and replay is safe because order status setting is idempotent for this event type. Restrict database write access and record operator/ticket context outside the DB.

## Secret rotation and monitoring

Use a randomly generated secret of at least 24 characters, store it in deployment secret management, and keep it out of source control and logs. This MVP supports one configured secret at a time; coordinate a sender cutover and deploy the receiver secret together. Production rotation without downtime should add `key_id` headers and bounded dual-key verification.

Monitor API availability, rate-limit responses, webhook 401/413/429 rates, pending/failed/dead-letter counts, oldest pending event age, retry attempts, and SQLite disk/backup health. The demo has logs but no metrics exporter or alerting. Back up the SQLite database and validate restore procedures. Do not horizontally scale this polling worker without a durable queue or database lease/claim mechanism.
