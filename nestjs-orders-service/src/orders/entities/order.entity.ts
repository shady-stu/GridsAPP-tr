/**
 * Domain view of an order.
 *
 * Money is represented as a **decimal string** (`"199.90"`), never a JavaScript number:
 * binary floating point cannot represent most decimal amounts exactly, and rounding errors in
 * a payment domain are unacceptable. The repository converts Prisma's `Decimal` to a fixed
 * 2-decimal string at the boundary, and DTOs pass that string straight to the client.
 */
import type { OrderStatus } from '../../generated/prisma/enums.js';

export interface OrderRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly customerId: string;
  /** Owner used for resource-ownership checks (`USER` role sees only its own orders). */
  readonly userId: string;
  readonly status: OrderStatus;
  /** Fixed-scale decimal string, e.g. `"199.90"`. */
  readonly totalAmount: string;
  /** ISO 4217 code, always three upper-case letters. */
  readonly currency: string;
  readonly reference: string | null;
  readonly notes: string | null;
  readonly deletedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface OrderStatusHistoryRecord {
  readonly id: string;
  readonly orderId: string;
  readonly fromStatus: OrderStatus | null;
  readonly toStatus: OrderStatus;
  readonly changedByUserId: string | null;
  readonly reason: string | null;
  readonly changedAt: Date;
}

export interface OrderWithHistory extends OrderRecord {
  readonly history: OrderStatusHistoryRecord[];
}
