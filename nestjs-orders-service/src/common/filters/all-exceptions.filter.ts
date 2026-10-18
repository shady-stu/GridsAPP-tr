/**
 * The single place where exceptions become HTTP responses.
 *
 * Registered once, globally, through `APP_FILTER` in `AppModule`.
 *
 * Guarantees:
 *  * One consistent envelope for every failure (`ApiErrorBody`).
 *  * Meaningful HTTP status codes are preserved (400/401/403/404/409/429/503/500).
 *  * Stack traces, SQL text, Prisma meta objects, secrets and internal messages are logged
 *    server-side but **never** serialised to the client.
 *  * 5xx responses are logged at `error` level with the correlation id; 4xx at `warn`.
 */
import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { DomainError } from '../errors/domain-error.js';
import { mapPrismaErrorToDomainError } from '../errors/prisma-error.mapper.js';
import { ERROR_CODES, type ApiErrorBody, type ApiErrorDetail, type ErrorCode } from '../interfaces/api-error.interface.js';
import { REQUEST_ID_HEADER } from '../constants.js';
import { RequestContextService } from '../context/request-context.service.js';

interface NormalisedFailure {
  status: number;
  /** Human-readable summary; already safe for clients. */
  message: string;
  errorCode: ErrorCode;
  details?: ApiErrorDetail[];
  /** Server-side only, never serialised. */
  internalMessage?: string;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  constructor(private readonly requestContext: RequestContextService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const contextType = host.getType<'http' | 'ws' | 'rpc'>();
    if (contextType !== 'http') {
      // Background/job contexts rethrow so the failing worker can record the failure itself.
      throw exception;
    }

    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const requestId =
      this.requestContext.getRequestId() ??
      readHeader(request.headers[REQUEST_ID_HEADER]) ??
      randomUUID();

    const failure = this.normalise(exception);
    const body: ApiErrorBody = {
      statusCode: failure.status,
      error: HttpStatus[failure.status] ?? 'Error',
      message: failure.message,
      requestId,
      errorCode: failure.errorCode,
      ...(failure.details && failure.details.length > 0 ? { details: failure.details } : {}),
      timestamp: new Date().toISOString(),
      path: request.originalUrl ?? request.url ?? 'unknown',
    };

    // Correlate the log line with the response and the caller's request id.
    response.setHeader(REQUEST_ID_HEADER, requestId);

    const logContext = {
      requestId,
      method: request.method,
      path: body.path,
      statusCode: failure.status,
      errorCode: failure.errorCode,
      ...(failure.internalMessage ? { internal: failure.internalMessage } : {}),
    };

    if (failure.status >= 500) {
      // Only truly unexpected failures carry a stack; domain/HTTP errors are expected control flow.
      const stack = exception instanceof Error ? exception.stack : undefined;
      this.logger.error(`${request.method} ${body.path} -> ${failure.status}`, stack, JSON.stringify(logContext));
    } else {
      this.logger.warn(`${request.method} ${body.path} -> ${failure.status}`, JSON.stringify(logContext));
    }

    if (response.headersSent) return;
    response.status(failure.status).json(body);
  }

  private normalise(exception: unknown): NormalisedFailure {
    // 1. Domain errors raised by application services (preferred path).
    if (exception instanceof DomainError) {
      return {
        status: exception.statusCode,
        message: exception.publicMessage,
        errorCode: exception.errorCode,
        details: exception.details,
      };
    }

    // 2. HTTP exceptions thrown by the framework (guards, pipes, `@nestjs/throttler`, ...).
    if (exception instanceof HttpException) {
      return this.normaliseHttpException(exception);
    }

    // 3. Defensive: a Prisma failure that escaped a repository adapter.
    const mapped = mapPrismaErrorToDomainError(exception);
    if (mapped) {
      return {
        status: mapped.statusCode,
        message: mapped.publicMessage,
        errorCode: mapped.errorCode,
        internalMessage: exception instanceof Error ? exception.message : undefined,
      };
    }

    // 4. Anything else is an internal error; say nothing useful to the caller.
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
      errorCode: ERROR_CODES.INTERNAL_ERROR,
      internalMessage: exception instanceof Error ? exception.message : String(exception),
    };
  }

  private normaliseHttpException(exception: HttpException): NormalisedFailure {
    const status = exception.getStatus();
    const raw = exception.getResponse() as unknown;

    let message = exception.message;
    let errorCode: ErrorCode | undefined;
    let details: ApiErrorDetail[] | undefined;

    if (typeof raw === 'string') {
      message = raw;
    } else if (typeof raw === 'object' && raw !== null) {
      const record = raw as Record<string, unknown>;
      // NestJS 12 serialises the new `errorCode` option into the exception response body.
      if (typeof record.errorCode === 'string') {
        errorCode = record.errorCode as ErrorCode;
      }
      if (Array.isArray(record.message)) {
        // `ValidationPipe` produces an array of messages; expose them as field details.
        details = (record.message as unknown[]).map((entry) => toValidationDetail(entry));
        message = 'Request validation failed';
      } else if (typeof record.message === 'string') {
        message = record.message;
      }
    }

    if (exception instanceof ThrottlerException) {
      errorCode = ERROR_CODES.RATE_LIMITED;
      message = 'Too many requests';
    }

    return {
      status,
      message,
      errorCode: errorCode ?? defaultErrorCodeForStatus(status),
      details,
      internalMessage: exception.message,
    };
  }
}

function defaultErrorCodeForStatus(status: number): ErrorCode {
  switch (status) {
    case HttpStatus.BAD_REQUEST:
      return ERROR_CODES.VALIDATION_FAILED;
    case HttpStatus.UNAUTHORIZED:
      return ERROR_CODES.UNAUTHENTICATED;
    case HttpStatus.FORBIDDEN:
      return ERROR_CODES.FORBIDDEN;
    case HttpStatus.NOT_FOUND:
      return ERROR_CODES.NOT_FOUND;
    case HttpStatus.CONFLICT:
      return ERROR_CODES.CONFLICT;
    case HttpStatus.TOO_MANY_REQUESTS:
      return ERROR_CODES.RATE_LIMITED;
    case HttpStatus.SERVICE_UNAVAILABLE:
      return ERROR_CODES.DATABASE_UNAVAILABLE;
    default:
      return status >= 500 ? ERROR_CODES.INTERNAL_ERROR : ERROR_CODES.VALIDATION_FAILED;
  }
}

/**
 * Turn a `class-validator` message (often `"totalAmount must not be less than 0"`) into a
 * `{ field, message }` pair without leaking the raw constraint object.
 */
function toValidationDetail(entry: unknown): ApiErrorDetail {
  if (typeof entry === 'string') {
    const match = /^([A-Za-z0-9_.$]+)\s+(.*)$/.exec(entry);
    if (match) {
      return { field: match[1], message: entry };
    }
    return { field: null, message: entry };
  }
  if (typeof entry === 'object' && entry !== null) {
    const record = entry as Record<string, unknown>;
    const property = typeof record.property === 'string' ? record.property : null;
    const constraints = record.constraints;
    const firstConstraint =
      typeof constraints === 'object' && constraints !== null
        ? Object.values(constraints as Record<string, unknown>)[0]
        : undefined;
    return {
      field: property,
      message: typeof firstConstraint === 'string' ? firstConstraint : 'is invalid',
    };
  }
  return { field: null, message: 'is invalid' };
}

function readHeader(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}
