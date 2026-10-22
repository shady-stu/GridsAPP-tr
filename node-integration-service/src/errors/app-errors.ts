/**
 * Typed application error model and the central error-to-HTTP mapper.
 *
 * Design rules:
 * - Errors thrown by services/clients are always one of the AppError classes
 *   below (or a ZodError from inline parsing, which we also map).
 * - `publicMessage` is what API callers see; internal `cause`d details and
 *   stack traces stay in server-side logs only.
 * - The mapper is the ONLY place that turns promised/h thrown errors into
 *   HTTP responses, which keeps logging non-duplicated and formats consistent.
 */

import { ZodError } from 'zod'

export const ERROR_CODES = {
  validation: 'VALIDATION_ERROR',
  notFound: 'NOT_FOUND',
  unauthorized: 'UNAUTHORIZED',
  forbidden: 'FORBIDDEN',
  rateLimited: 'RATE_LIMITED',
  serviceUnavailable: 'SERVICE_UNAVAILABLE',
  upstreamTimeout: 'UPSTREAM_TIMEOUT',
  upstreamNetwork: 'UPSTREAM_NETWORK_ERROR',
  upstreamBadResponse: 'UPSTREAM_BAD_RESPONSE',
  upstreamHttp: 'UPSTREAM_HTTP_ERROR',
  internal: 'INTERNAL_ERROR',
} as const

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES]

export interface FieldIssue {
  /** Dotted path, e.g. `query.limit` or `body.category`. */
  readonly path: string
  readonly message: string
}

export interface PublicErrorBody {
  readonly code: ErrorCode | string
  readonly message: string
  readonly requestId: string
  readonly errors?: FieldIssue[]
}

/**
 * Base class for all errors that carry an HTTP meaning.
 *
 * Subclasses only extend the constructor; `message` is always the public,
 * safe-for-callers text. Internal context (network details, upstream status…)
 * lives on `internalMessage` / `cause` and is written to logs, never to
 * response bodies.
 */
export class AppError extends Error {
  readonly code: ErrorCode
  readonly statusCode: number
  readonly publicMessage: string
  /** Optional additional fields that are safe to expose (e.g. field issues). */
  readonly publicDetails?: unknown

  constructor(
    code: ErrorCode,
    statusCode: number,
    publicMessage: string,
    options: { cause?: unknown; publicDetails?: unknown } = {},
  ) {
    super(publicMessage, { cause: options.cause })
    this.name = 'AppError'
    this.code = code
    this.statusCode = statusCode
    this.publicMessage = publicMessage
    if (options.publicDetails !== undefined) this.publicDetails = options.publicDetails
  }
}

export class ValidationError extends AppError {
  readonly issues: readonly FieldIssue[]

  constructor(issues: readonly FieldIssue[] = [], message = 'Request validation failed.') {
    super(ERROR_CODES.validation, 400, message, { publicDetails: issues })
    this.name = 'ValidationError'
    this.issues = issues
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found.') {
    super(ERROR_CODES.notFound, 404, message)
    this.name = 'NotFoundError'
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required.') {
    super(ERROR_CODES.unauthorized, 401, message)
    this.name = 'UnauthorizedError'
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Access denied.') {
    super(ERROR_CODES.forbidden, 403, message)
    this.name = 'ForbiddenError'
  }
}

export class RateLimitError extends AppError {
  constructor(message = 'Too many requests.') {
    super(ERROR_CODES.rateLimited, 429, message)
    this.name = 'RateLimitError'
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable.') {
    super(ERROR_CODES.serviceUnavailable, 503, message)
    this.name = 'ServiceUnavailableError'
  }
}

/** Root class for upstream (outbound HTTP) failures; groups 502/504 mapping. */
export class UpstreamError extends AppError {
  constructor(
    code: ErrorCode,
    statusCode: number,
    publicMessage: string,
    opts: { cause?: unknown; internalMessage?: string } = {},
  ) {
    super(code, statusCode, publicMessage, { cause: opts.cause })
    this.name = 'UpstreamError'
    if (opts.internalMessage) this.cause ??= new Error(opts.internalMessage)
  }
}

export class UpstreamTimeoutError extends UpstreamError {
  constructor(timeoutMs: number, opts: { cause?: unknown } = {}) {
    super(ERROR_CODES.upstreamTimeout, 504, 'Upstream API did not respond in time.', {
      cause: opts.cause,
      internalMessage: `aborted after ${timeoutMs}ms`,
    })
    this.name = 'UpstreamTimeoutError'
  }
}

export class UpstreamNetworkError extends UpstreamError {
  constructor(opts: { cause?: unknown } = {}) {
    super(ERROR_CODES.upstreamNetwork, 502, 'Upstream API is unreachable.', { cause: opts.cause })
    this.name = 'UpstreamNetworkError'
  }
}

export class UpstreamBadResponseError extends UpstreamError {
  constructor(opts: { cause?: unknown } = {}) {
    super(ERROR_CODES.upstreamBadResponse, 502, 'Upstream API returned an invalid payload.', {
      cause: opts.cause,
    })
    this.name = 'UpstreamBadResponseError'
  }
}

/** Upstream responded with a non-2xx status. The raw upstream body is never carried. */
export class UpstreamHttpError extends UpstreamError {
  /** Only the numeric upstream status is recorded; bodies are discarded. */
  readonly upstreamStatus: number

  constructor(upstreamStatus: number, opts: { cause?: unknown } = {}) {
    super(ERROR_CODES.upstreamHttp, 502, 'Upstream API returned an error response.', {
      cause: opts.cause,
      internalMessage: `upstream HTTP ${upstreamStatus}`,
    })
    this.name = 'UpstreamHttpError'
    this.upstreamStatus = upstreamStatus
  }
}

export const isAppError = (value: unknown): value is AppError =>
  value instanceof AppError || value instanceof UpstreamError

/** Converts Zod issues into our field issue shape. */
export function zodIssuesToFieldIssues(error: ZodError, pathPrefix = ''): FieldIssue[] {
  return error.issues.map((issue) => {
    const localPath = issue.path.map(String).join('.')
    const fullPath = [pathPrefix, localPath].filter(Boolean).join('.')
    return { path: fullPath || '(root)', message: issue.message }
  })
}

export interface MappedErrorResponse {
  readonly statusCode: number
  readonly body: PublicErrorBody
}

/** Matches the payload shape thrown by @fastify/rate-limit's errorResponseBuilder. */
function isRateLimitPayload(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { readonly code?: unknown }).code === 'RATE_LIMITED'
  )
}

/**
 * Central error-to-HTTP mapper. Given any thrown value it produces the
 * structured response body for the API. Stack traces and causes are never
 * included; unexpected errors collapse to a generic 500.
 */
export function mapErrorToHttpResponse(error: unknown, requestId: string): MappedErrorResponse {
  let statusCode: number
  let code: string
  let message: string
  let errors: FieldIssue[] | undefined

  if (error instanceof ZodError) {
    statusCode = 400
    code = ERROR_CODES.validation
    message = 'Request validation failed.'
    errors = zodIssuesToFieldIssues(error)
  } else if (isRateLimitPayload(error)) {
    // @fastify/rate-limit THROWS the errorResponseBuilder result; honor that shape.
    statusCode = 429
    code = ERROR_CODES.rateLimited
    message = 'Too many requests, please slow down.'
  } else if (error instanceof AppError) {
    statusCode = error.statusCode
    code = error.code
    message = error.publicMessage
    if (error instanceof ValidationError) errors = [...error.issues]
  } else {
    statusCode = 500
    code = ERROR_CODES.internal
    message = 'Internal server error.'
  }

  const body: PublicErrorBody =
    errors !== undefined && errors.length > 0
      ? { code, message, requestId, errors }
      : { code, message, requestId }
  return { statusCode, body }
}

/** Human-readable label used for logs when mapping framework-level errors. */
export function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`
  return String(error)
}
