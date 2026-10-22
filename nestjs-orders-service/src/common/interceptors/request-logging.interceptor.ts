/**
 * Logs one structured line per completed request with its status and duration, and enriches
 * the correlation context with the authenticated principal.
 *
 * Interceptors run *after* guards, which is exactly why the principal is captured here: the
 * authentication guard has already validated the token and attached `request.user`.
 *
 * The interceptor never reads or logs request/response bodies, so credentials, tokens and
 * webhook payloads cannot leak into the log stream.
 */
import {
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { tap, type Observable } from 'rxjs';
import { RequestContextService } from '../context/request-context.service.js';
import type { AuthenticatedUser } from '../interfaces/authenticated-user.interface.js';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  constructor(private readonly requestContext: RequestContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<Request & { user?: AuthenticatedUser }>();
    const response = http.getResponse<Response>();
    const startedAt = process.hrtime.bigint();

    // Guards have already run, so `request.user` is available for correlation.
    if (request.user) {
      this.requestContext.patch({
        userId: request.user.userId,
        tenantId: request.user.tenantId,
      });
    }

    const routePath = request.route?.path;
    const handler = context.getHandler().name ?? 'handler';

    return next.handle().pipe(
      tap({
        next: () => this.write(request, response, startedAt, routePath, handler, undefined),
        error: (error: unknown) => this.write(request, response, startedAt, routePath, handler, error),
      }),
    );
  }

  private write(
    request: Request,
    response: Response,
    startedAt: bigint,
    routePath: string | undefined,
    handler: string,
    error: unknown,
  ): void {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    const status = error ? (response.statusCode >= 400 ? response.statusCode : 500) : response.statusCode;
    const context = this.requestContext.get();

    const entry = {
      requestId: context?.requestId,
      method: request.method,
      path: request.originalUrl ?? request.url,
      route: routePath,
      handler,
      status,
      durationMs: Math.round(durationMs * 100) / 100,
      userId: context?.userId,
      tenantId: context?.tenantId,
      ...(error instanceof Error ? { errorName: error.name } : {}),
    };

    // The exception filter logs the failure detail and stack; here we only record timing.
    if (status >= 500) {
      this.logger.error(`${entry.method} ${entry.path} ${status} in ${entry.durationMs}ms`, JSON.stringify(entry));
    } else {
      this.logger.log(`${entry.method} ${entry.path} ${status} in ${entry.durationMs}ms`, JSON.stringify(entry));
    }
  }
}
