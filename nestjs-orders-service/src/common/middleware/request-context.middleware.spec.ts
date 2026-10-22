/**
 * Unit tests for the correlation middleware.
 *
 * The correlation id travels through logs and across services, so two properties matter: a
 * well-formed inbound id is preserved, and anything else is replaced by a fresh UUID (never echoed
 * back verbatim, which would let a caller inject arbitrary content into log lines and headers).
 */
import { describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
import { RequestContextService } from '../context/request-context.service.js';
import { RequestContextMiddleware, resolveRequestId } from './request-context.middleware.js';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('resolveRequestId', () => {
  it('keeps a well-formed inbound id', () => {
    expect(resolveRequestId('abc12345')).toBe('abc12345');
    expect(resolveRequestId('trace-id.sub:1')).toBe('trace-id.sub:1');
  });

  it('generates a v4 UUID when the inbound value is unusable', () => {
    for (const inbound of [undefined, '', 'short', 'has spaces', 'x'.repeat(129), 42]) {
      expect(resolveRequestId(inbound)).toMatch(UUID_V4);
    }
  });
});

describe('RequestContextMiddleware', () => {
  function build(headerValue: string | undefined) {
    const context = new RequestContextService();
    const middleware = new RequestContextMiddleware(context);
    const request = { headers: { 'x-request-id': headerValue }, method: 'POST', url: '/api/v1/orders' };
    const response = { setHeader: vi.fn() };
    const next = vi.fn() as unknown as NextFunction;
    return { context, middleware, request, response, next };
  }

  it('echoes the request id on the response and makes it available downstream', () => {
    const { context, middleware, request, response, next } = build('abc12345');
    let observed: string | undefined;

    middleware.use(
      request as unknown as Request,
      response as unknown as Response,
      ((() => {
        observed = context.getRequestId();
        (next as unknown as () => void)();
      }) as unknown) as NextFunction,
    );

    expect(response.setHeader).toHaveBeenCalledWith('x-request-id', 'abc12345');
    expect(observed).toBe('abc12345');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('records the method and path in the context', () => {
    const { context, middleware, request, response } = build(undefined);

    middleware.use(
      request as unknown as Request,
      response as unknown as Response,
      (() => {
        expect(context.get()).toMatchObject({ method: 'POST', path: '/api/v1/orders' });
        expect(context.getRequestId()).toMatch(UUID_V4);
      }) as unknown as NextFunction,
    );
  });
});
