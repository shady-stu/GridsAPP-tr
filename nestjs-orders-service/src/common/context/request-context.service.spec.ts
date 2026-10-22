/**
 * Unit tests for the ambient request context.
 *
 * `AsyncLocalStorage` only works if the store survives an `await`, so the interesting assertions
 * run inside a promise chain rather than synchronously.
 */
import { describe, expect, it } from 'vitest';
import { RequestContextService } from './request-context.service.js';

describe('RequestContextService', () => {
  it('exposes the context to nested asynchronous calls', async () => {
    const service = new RequestContextService();

    const observed = await service.run({ requestId: 'req-1', userId: 'u1' }, async () => {
      await Promise.resolve();
      return service.get();
    });

    expect(observed).toEqual({ requestId: 'req-1', userId: 'u1' });
  });

  it('returns undefined outside a context', () => {
    const service = new RequestContextService();
    expect(service.get()).toBeUndefined();
    expect(service.getRequestId()).toBeUndefined();
  });

  it('does not leak the store to sibling calls', async () => {
    const service = new RequestContextService();

    const [first, second] = await Promise.all([
      service.run({ requestId: 'a' }, async () => service.getRequestId()),
      service.run({ requestId: 'b' }, async () => service.getRequestId()),
    ]);

    expect(first).toBe('a');
    expect(second).toBe('b');
  });

  it('patches the active context', () => {
    const service = new RequestContextService();
    service.run({ requestId: 'req' }, () => {
      service.patch({ tenantId: 't1' });
      expect(service.get()).toEqual({ requestId: 'req', tenantId: 't1' });
    });
  });

  it('ignores a patch outside a context instead of throwing', () => {
    const service = new RequestContextService();
    expect(() => service.patch({ tenantId: 't1' })).not.toThrow();
    expect(service.get()).toBeUndefined();
  });
});
