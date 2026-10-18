/**
 * Request-scoped correlation context.
 *
 * NestJS request-scoped providers are the idiomatic way to carry per-request state, but they
 * force every consumer up the injection graph to be request-scoped as well (and that has a
 * real performance cost). For pure *ambient* data such as the correlation id we use
 * `AsyncLocalStorage` instead: the store follows the async call chain without changing any
 * injection scope, so singletons can still log with the correct `requestId`.
 *
 * The store is entered exactly once per HTTP request by `RequestContextMiddleware`.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';

export interface RequestContext {
  /** Correlation id, echoed in the `x-request-id` response header and every log line. */
  requestId: string;
  method?: string;
  path?: string;
  /** Populated by the authentication guard once a principal is known. */
  userId?: string;
  tenantId?: string;
}

@Injectable()
export class RequestContextService {
  private readonly storage = new AsyncLocalStorage<RequestContext>();

  /** Run `callback` with `context` available to every nested async call. */
  run<T>(context: RequestContext, callback: () => T): T {
    return this.storage.run(context, callback);
  }

  get(): RequestContext | undefined {
    return this.storage.getStore();
  }

  getRequestId(): string | undefined {
    return this.storage.getStore()?.requestId;
  }

  /** Enrich the active context (no-op outside a request, e.g. background jobs). */
  patch(patch: Partial<RequestContext>): void {
    const store = this.storage.getStore();
    if (!store) return;
    Object.assign(store, patch);
  }
}
