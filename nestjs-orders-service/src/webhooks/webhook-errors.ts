/**
 * Failure classification used by the webhook processor.
 *
 * Retrying is only useful for failures that can go away on their own. Splitting them explicitly
 * — instead of retrying everything a fixed number of times — means a permanently broken event
 * reaches `DEAD_LETTER` immediately (visible in the operational summary) rather than after five
 * pointless attempts, and a transient race (the order row not committed yet) is retried.
 */

/** The event can never succeed: retrying wastes time and hides the problem. */
export class PermanentWebhookError extends Error {
  readonly permanent = true;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'PermanentWebhookError';
  }
}

/** The event may succeed later: retried with exponential backoff up to `maxAttempts`. */
export class TransientWebhookError extends Error {
  readonly permanent = false;

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'TransientWebhookError';
  }
}

export function isPermanentWebhookError(error: unknown): boolean {
  return error instanceof PermanentWebhookError;
}

/** Compact, log-safe description of an unknown throwable. */
export function describeWebhookError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}
