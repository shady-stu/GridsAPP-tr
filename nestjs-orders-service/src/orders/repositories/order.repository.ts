/**
 * Persistence contract for orders.
 *
 * Two design decisions are visible in this interface:
 *
 *  * **`tenantId` first, always.** Same reasoning as the customer repository: the adapter builds
 *    the SQL predicate from it, so cross-tenant reads are impossible by construction.
 *  * **`ownerUserId` is an optional restriction, not a separate method.** Controllers translate
 *    "this caller has role USER" into `ownerUserId: caller.userId`; ADMIN simply omits it. That
 *    keeps the visibility rule in one place instead of duplicating two query shapes.
 */
import { REPOSITORY_TOKENS } from '../../common/constants.js';
import type { PageRequest, PaginatedResult } from '../../common/interfaces/pagination.interface.js';
import type { OrderStatus } from '../../generated/prisma/enums.js';
import type { OrderRecord, OrderWithHistory } from '../entities/order.entity.js';

export const ORDER_REPOSITORY = REPOSITORY_TOKENS.ORDER;

export interface CreateOrderData {
  tenantId: string;
  customerId: string;
  userId: string;
  /** Decimal string; validated to 2 decimal places by the DTO layer. */
  totalAmount: string;
  currency: string;
  reference?: string | null;
  notes?: string | null;
}

export interface UpdateOrderData {
  reference?: string | null;
  notes?: string | null;
}

export interface FindOrderOptions {
  /** Only return the order when this user owns it (ownership enforcement). */
  ownerUserId?: string;
  /** Soft-deleted orders are hidden unless explicitly requested. */
  includeDeleted?: boolean;
}

export interface ListOrdersFilter {
  tenantId: string;
  status?: OrderStatus;
  customerId?: string;
  /** Ownership restriction; omitted for ADMIN. */
  ownerUserId?: string;
  includeDeleted?: boolean;
  page: PageRequest;
}

export interface TransitionStatusParams {
  tenantId: string;
  orderId: string;
  /** Expected current status. The update only succeeds if the row still has this value. */
  from: OrderStatus;
  to: OrderStatus;
  changedByUserId?: string | null;
  reason?: string | null;
  /** Ownership restriction applied to the compare-and-swap. */
  ownerUserId?: string;
}

export interface OrderRepository {
  create(data: CreateOrderData): Promise<OrderRecord>;

  findById(
    tenantId: string,
    id: string,
    options?: FindOrderOptions,
  ): Promise<OrderRecord | null>;

  findWithHistory(
    tenantId: string,
    id: string,
    options?: FindOrderOptions,
  ): Promise<OrderWithHistory | null>;

  update(
    tenantId: string,
    id: string,
    data: UpdateOrderData,
    options?: FindOrderOptions,
  ): Promise<OrderRecord | null>;

  /** Soft delete. Returns `false` when the order is absent, already deleted, or not owned. */
  softDelete(tenantId: string, id: string, options?: FindOrderOptions): Promise<boolean>;

  list(filter: ListOrdersFilter): Promise<PaginatedResult<OrderRecord>>;

  /**
   * Atomic status change: compare-and-swap plus an audit row in one transaction.
   *
   * Returns `null` when the expected `from` status no longer matches — i.e. somebody else won
   * the race — so callers can map that onto a 409 instead of silently overwriting a state
   * change that already happened.
   */
  transitionStatus(params: TransitionStatusParams): Promise<OrderRecord | null>;

  /**
   * Look an order up **without** a tenant filter.
   *
   * This exists for exactly one caller — the verified payment webhook — which must *discover*
   * the owning tenant from the (already signature-verified) payload. Every other code path uses
   * the tenant-scoped methods above; the explicit name is meant to make a reviewer stop and
   * check the call site.
   */
  findAcrossTenantsById(id: string): Promise<OrderRecord | null>;
}
