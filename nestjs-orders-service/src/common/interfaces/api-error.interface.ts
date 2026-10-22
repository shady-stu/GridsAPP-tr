/**
 * The uniform error envelope returned by every failure path.
 *
 * Shape (matching the assignment specification):
 *
 * ```json
 * {
 *   "statusCode": 400,
 *   "error": "Bad Request",
 *   "message": "Request validation failed",
 *   "requestId": "0f8f...",
 *   "errorCode": "VALIDATION_FAILED",
 *   "details": [{ "field": "totalAmount", "message": "..." }],
 *   "timestamp": "2026-01-01T00:00:00.000Z",
 *   "path": "/api/v1/orders"
 * }
 * ```
 *
 * `errorCode` is the NestJS 12 machine-readable addition to `HttpExceptionOptions`: clients
 * branch on it instead of parsing human-readable messages.
 */
export interface ApiErrorDetail {
  /** Dotted path of the offending field, or `null` for whole-request problems. */
  field: string | null;
  message: string;
}

export interface ApiErrorBody {
  statusCode: number;
  error: string;
  message: string;
  requestId: string;
  errorCode?: string;
  details?: ApiErrorDetail[];
  timestamp: string;
  path: string;
}

/** Stable error codes shared with API consumers and documented in OpenAPI. */
export const ERROR_CODES = {
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  DUPLICATE_WEBHOOK_EVENT: 'DUPLICATE_WEBHOOK_EVENT',
  INVALID_SIGNATURE: 'INVALID_SIGNATURE',
  STALE_WEBHOOK_EVENT: 'STALE_WEBHOOK_EVENT',
  INVALID_STATUS_TRANSITION: 'INVALID_STATUS_TRANSITION',
  RATE_LIMITED: 'RATE_LIMITED',
  DATABASE_UNAVAILABLE: 'DATABASE_UNAVAILABLE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];
