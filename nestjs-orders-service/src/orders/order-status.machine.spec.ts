/**
 * Unit tests for the order status machine.
 *
 * The state machine is the single source of truth for "may this order move from A to B?", used by
 * both the HTTP API and the payment webhook handler. These tests pin the exact transition table:
 * a change to it that is not reflected here is a deliberate review decision, not an accident.
 */
import { describe, expect, it } from 'vitest';
import { InvalidStatusTransitionError } from '../common/errors/domain-error.js';
import type { OrderStatus } from '../generated/prisma/enums.js';
import {
  ORDER_STATUS_TRANSITIONS,
  TERMINAL_ORDER_STATUSES,
  allowedTransitionsFrom,
  assertTransitionAllowed,
  canTransition,
} from './order-status.machine.js';

const ALL_STATUSES = Object.keys(ORDER_STATUS_TRANSITIONS) as OrderStatus[];

describe('order status machine', () => {
  describe('canTransition', () => {
    it('allows the documented forward and cancellation paths', () => {
      expect(canTransition('PENDING', 'PAID')).toBe(true);
      expect(canTransition('PENDING', 'CANCELLED')).toBe(true);
      expect(canTransition('PAID', 'FULFILLED')).toBe(true);
      expect(canTransition('PAID', 'REFUNDED')).toBe(true);
      expect(canTransition('PAID', 'CANCELLED')).toBe(true);
      expect(canTransition('FULFILLED', 'REFUNDED')).toBe(true);
    });

    it('rejects skipping a step', () => {
      expect(canTransition('PENDING', 'FULFILLED')).toBe(false);
      expect(canTransition('PENDING', 'REFUNDED')).toBe(false);
    });

    it('rejects moving backwards', () => {
      expect(canTransition('PAID', 'PENDING')).toBe(false);
      expect(canTransition('FULFILLED', 'PAID')).toBe(false);
      expect(canTransition('REFUNDED', 'PAID')).toBe(false);
    });

    it('never allows a no-op transition', () => {
      for (const status of ALL_STATUSES) {
        expect(canTransition(status, status)).toBe(false);
      }
    });
  });

  describe('terminal states', () => {
    it('treats CANCELLED and REFUNDED as terminal', () => {
      expect([...TERMINAL_ORDER_STATUSES].sort()).toEqual(['CANCELLED', 'REFUNDED']);
    });

    it('exposes no outgoing transitions from a terminal state', () => {
      expect(allowedTransitionsFrom('CANCELLED')).toEqual([]);
      expect(allowedTransitionsFrom('REFUNDED')).toEqual([]);
      for (const target of ALL_STATUSES) {
        expect(canTransition('CANCELLED', target)).toBe(false);
        expect(canTransition('REFUNDED', target)).toBe(false);
      }
    });
  });

  describe('assertTransitionAllowed', () => {
    it('returns without throwing for a legal transition', () => {
      expect(() => assertTransitionAllowed('PENDING', 'PAID')).not.toThrow();
    });

    it('throws a 409 domain error naming the allowed alternatives', () => {
      expect(() => assertTransitionAllowed('CANCELLED', 'PAID')).toThrow(InvalidStatusTransitionError);

      try {
        assertTransitionAllowed('PENDING', 'REFUNDED');
        expect.unreachable('expected assertTransitionAllowed to throw');
      } catch (error) {
        expect(error).toBeInstanceOf(InvalidStatusTransitionError);
        const domainError = error as InvalidStatusTransitionError;
        expect(domainError.statusCode).toBe(409);
        expect(domainError.errorCode).toBe('INVALID_STATUS_TRANSITION');
        expect(domainError.publicMessage).toContain('PENDING');
        expect(domainError.publicMessage).toContain('PAID');
      }
    });

    it('describes a terminal state instead of listing an empty set', () => {
      try {
        assertTransitionAllowed('REFUNDED', 'PAID');
        expect.unreachable('expected assertTransitionAllowed to throw');
      } catch (error) {
        expect((error as Error).message).toContain('terminal state');
      }
    });
  });
});
