/**
 * Domain-level error hierarchy.
 *
 * Application services throw these instead of HTTP exceptions so business rules stay
 * framework-agnostic. `AllExceptionsFilter` maps each one onto the correct HTTP status and
 * machine-readable `errorCode`.
 */
import { ERROR_CODES, type ApiErrorDetail, type ErrorCode } from '../interfaces/api-error.interface.js';

export interface DomainErrorOptions {
  details?: ApiErrorDetail[];
  /** Original cause, logged server-side but never returned to the client. */
  cause?: unknown;
}

export abstract class DomainError extends Error {
  abstract readonly statusCode: number;
  abstract readonly errorCode: ErrorCode;
  readonly details?: ApiErrorDetail[];

  protected constructor(message: string, options: DomainErrorOptions = {}) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = new.target.name;
    this.details = options.details;
  }

  /** Public message safe to return to a client (never contains internals). */
  get publicMessage(): string {
    return this.message;
  }
}

/** Input that passed the DTO layer but violates a business rule. -> 400 */
export class ValidationDomainError extends DomainError {
  readonly statusCode = 400;
  readonly errorCode = ERROR_CODES.VALIDATION_FAILED;
  constructor(message: string, options: DomainErrorOptions = {}) {
    super(message, options);
  }
}

/** A resource is not visible to the caller (wrong tenant, wrong owner, or absent). -> 404 */
export class ResourceNotFoundError extends DomainError {
  readonly statusCode = 404;
  readonly errorCode = ERROR_CODES.NOT_FOUND;
  constructor(resource: string, options: DomainErrorOptions = {}) {
    super(`${resource} was not found`, options);
  }
}

/** Authentication required but missing or invalid. -> 401 */
export class UnauthenticatedError extends DomainError {
  readonly statusCode = 401;
  readonly errorCode = ERROR_CODES.UNAUTHENTICATED;
  constructor(message = 'Authentication is required', options: DomainErrorOptions = {}) {
    super(message, options);
  }
}

/** Authenticated but not permitted. -> 403 */
export class ForbiddenError extends DomainError {
  readonly statusCode = 403;
  readonly errorCode = ERROR_CODES.FORBIDDEN;
  constructor(
    message = 'You are not allowed to perform this action',
    options: DomainErrorOptions = {},
  ) {
    super(message, options);
  }
}

/** Unique-constraint violation or conflicting state. -> 409 */
export class ConflictError extends DomainError {
  readonly statusCode = 409;
  readonly errorCode = ERROR_CODES.CONFLICT;
  constructor(message: string, options: DomainErrorOptions = {}) {
    super(message, options);
  }
}

/** An order status change that the transition table forbids. -> 409 */
export class InvalidStatusTransitionError extends DomainError {
  readonly statusCode = 409;
  readonly errorCode = ERROR_CODES.INVALID_STATUS_TRANSITION;
  constructor(from: string, to: string, allowed: readonly string[]) {
    super(
      `Cannot change order status from ${from} to ${to}. Allowed transitions: ${
        allowed.length > 0 ? allowed.join(', ') : 'none (terminal state)'
      }`,
    );
  }
}

/** Webhook signature missing, malformed or mismatching. -> 401 */
export class InvalidSignatureError extends DomainError {
  readonly statusCode = 401;
  readonly errorCode = ERROR_CODES.INVALID_SIGNATURE;
  constructor(message = 'Webhook signature verification failed', options: DomainErrorOptions = {}) {
    super(message, options);
  }
}

/** Webhook timestamp outside the accepted tolerance window (replay protection). -> 400 */
export class StaleWebhookEventError extends DomainError {
  readonly statusCode = 400;
  readonly errorCode = ERROR_CODES.STALE_WEBHOOK_EVENT;
  constructor(message = 'Webhook event timestamp is outside the accepted tolerance window') {
    super(message);
  }
}

/** A duplicate provider event id was observed (idempotent no-op). -> 409 when rejected. */
export class DuplicateWebhookEventError extends DomainError {
  readonly statusCode = 409;
  readonly errorCode = ERROR_CODES.DUPLICATE_WEBHOOK_EVENT;
  constructor(message = 'This webhook event has already been accepted') {
    super(message);
  }
}

/** Dependencies (PostgreSQL) are unreachable. -> 503 */
export class DatabaseUnavailableError extends DomainError {
  readonly statusCode = 503;
  readonly errorCode = ERROR_CODES.DATABASE_UNAVAILABLE;
  constructor(message = 'The database is currently unavailable', options: DomainErrorOptions = {}) {
    super(message, options);
  }
}
