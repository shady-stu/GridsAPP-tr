/**
 * The order status state machine.
 *
 * Kept as a pure data table plus pure functions so that:
 *  * the allowed transitions are reviewable at a glance,
 *  * `OrdersService` does not need a database round-trip to reject an illegal change,
 *  * both the HTTP API and the webhook processor apply exactly the same rules.
 *
 * ```
 *   PENDING ──▶ PAID ──▶ FULFILLED ──▶ REFUNDED (terminal)
 *      │         │            │
 *      │         └──▶ REFUNDED│
 *      └──▶ CANCELLED (terminal)
 *                 ▲
 *                 └── PAID ──▶ CANCELLED
 * ```
 */
import { InvalidStatusTransitionError } from '../common/errors/domain-error.js';
import type { OrderStatus } from '../generated/prisma/enums.js';

/** Adjacency list of legal transitions. Empty array = terminal state. */
export const ORDER_STATUS_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PENDING: ['PAID', 'CANCELLED'],
  PAID: ['FULFILLED', 'REFUNDED', 'CANCELLED'],
  FULFILLED: ['REFUNDED'],
  CANCELLED: [],
  REFUNDED: [],
};

/** Statuses from which no further transition is possible. */
export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = Object.entries(
  ORDER_STATUS_TRANSITIONS,
)
  .filter(([, allowed]) => allowed.length === 0)
  .map(([status]) => status as OrderStatus);

export function allowedTransitionsFrom(status: OrderStatus): readonly OrderStatus[] {
  return ORDER_STATUS_TRANSITIONS[status] ?? [];
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return false;
  return allowedTransitionsFrom(from).includes(to);
}

/** Throws `InvalidStatusTransitionError` (HTTP 409) when the transition is not allowed. */
export function assertTransitionAllowed(from: OrderStatus, to: OrderStatus): void {
  if (!canTransition(from, to)) {
    throw new InvalidStatusTransitionError(from, to, allowedTransitionsFrom(from));
  }
}
