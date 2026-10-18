/**
 * Establishes the correlation context for each HTTP request.
 *
 * Behaviour:
 *  * Reuses an inbound `x-request-id` when it is well-formed, so a correlation id can travel
 *    across services and reverse proxies.
 *  * Otherwise generates a UUID.
 *  * Always echoes the id back on the response.
 *  * Runs the remainder of the request *inside* `AsyncLocalStorage.run`, which is what makes
 *    the id available to loggers and background operations spawned by the handler.
 */
import { randomUUID } from 'node:crypto';
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { REQUEST_ID_HEADER } from '../constants.js';
import { RequestContextService } from '../context/request-context.service.js';

/** Conservative allow-list: a correlation id must be safe to put in a log line and a header. */
const SAFE_REQUEST_ID = /^[A-Za-z0-9._:-]{8,128}$/;

export function resolveRequestId(inbound: unknown): string {
  if (typeof inbound === 'string' && SAFE_REQUEST_ID.test(inbound)) {
    return inbound;
  }
  return randomUUID();
}

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly requestContext: RequestContextService) {}

  use(request: Request, response: Response, next: NextFunction): void {
    const requestId = resolveRequestId(request.headers[REQUEST_ID_HEADER]);
    response.setHeader(REQUEST_ID_HEADER, requestId);

    this.requestContext.run(
      {
        requestId,
        method: request.method,
        path: request.originalUrl ?? request.url,
      },
      () => next(),
    );
  }
}
