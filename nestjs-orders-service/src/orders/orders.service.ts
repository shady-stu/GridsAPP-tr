/**
 * Order use cases.
 *
 * Business rules enforced here:
 *  * An order can only reference an **active customer of the same tenant**.
 *  * `USER` callers only see and mutate their own orders; `ADMIN` sees the whole tenant.
 *  * Status changes follow `order-status.machine.ts`; `PAID`/`REFUNDED` are normally driven by
 *    verified payment webhooks, not by hand.
 *  * Deleting an order is a **soft delete** (`deletedAt`), because payment webhooks keep
 *    referencing orders and an audit trail must survive.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConflictError, ResourceNotFoundError, ValidationDomainError } from '../common/errors/domain-error.js';
import { USER_ROLE, type AuthenticatedUser } from '../common/interfaces/authenticated-user.interface.js';
import type { PaginatedResult } from '../common/interfaces/pagination.interface.js';
import { normaliseMoney } from '../common/utils/money.util.js';
import { normalisePageRequest } from '../common/utils/pagination.util.js';
import {
  CUSTOMER_REPOSITORY,
  type CustomerRepository,
} from '../customers/repositories/customer.repository.js';
import type { OrderStatus } from '../generated/prisma/enums.js';
import { assertTransitionAllowed } from './order-status.machine.js';
import type { OrderRecord, OrderWithHistory } from './entities/order.entity.js';
import { ORDER_REPOSITORY, type FindOrderOptions, type OrderRepository } from './repositories/order.repository.js';
import type { CreateOrderDto } from './dto/create-order.dto.js';
import type { ListOrdersQueryDto } from './dto/list-orders.query.dto.js';
import type { UpdateOrderStatusDto } from './dto/update-order-status.dto.js';
import type { UpdateOrderDto } from './dto/update-order.dto.js';

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @Inject(ORDER_REPOSITORY) private readonly orders: OrderRepository,
    // Cross-module read: creating an order must validate the customer exists in the tenant.
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
  ) {}

  async create(principal: AuthenticatedUser, dto: CreateOrderDto): Promise<OrderRecord> {
    const customer = await this.customers.findById(principal.tenantId, dto.customerId);
    if (!customer) throw new ResourceNotFoundError('Customer');
    if (!customer.isActive) {
      throw new ValidationDomainError('This customer is deactivated and cannot receive new orders');
    }

    const created = await this.orders.create({
      tenantId: principal.tenantId,
      customerId: customer.id,
      userId: principal.userId,
      totalAmount: normaliseMoney(dto.totalAmount),
      currency: dto.currency,
      reference: dto.reference ?? null,
      notes: dto.notes ?? null,
    });

    this.logger.log(`Order ${created.id} created in tenant ${principal.tenantId}`);
    return created;
  }

  list(principal: AuthenticatedUser, query: ListOrdersQueryDto): Promise<PaginatedResult<OrderRecord>> {
    return this.orders.list({
      tenantId: principal.tenantId,
      status: query.status as OrderStatus | undefined,
      customerId: query.customerId,
      // Only an administrator may widen the view to include soft-deleted rows.
      includeDeleted: query.includeDeleted === true && principal.role === USER_ROLE.ADMIN,
      page: normalisePageRequest({ page: query.page, pageSize: query.pageSize }),
      ...this.ownership(principal),
    });
  }

  async getById(principal: AuthenticatedUser, id: string): Promise<OrderWithHistory> {
    const order = await this.orders.findWithHistory(principal.tenantId, id, this.ownership(principal));
    if (!order) throw new ResourceNotFoundError('Order');
    return order;
  }

  async update(
    principal: AuthenticatedUser,
    id: string,
    dto: UpdateOrderDto,
  ): Promise<OrderRecord> {
    // Resolve first so "not found" and "not yours" are both reported as 404 (no existence leak).
    const existing = await this.orders.findById(principal.tenantId, id, this.ownership(principal));
    if (!existing) throw new ResourceNotFoundError('Order');

    const updated = await this.orders.update(
      principal.tenantId,
      id,
      { reference: dto.reference, notes: dto.notes },
      this.ownership(principal),
    );
    if (!updated) throw new ResourceNotFoundError('Order');
    return updated;
  }

  async changeStatus(
    principal: AuthenticatedUser,
    id: string,
    dto: UpdateOrderStatusDto,
  ): Promise<OrderRecord> {
    const order = await this.orders.findById(principal.tenantId, id);
    if (!order) throw new ResourceNotFoundError('Order');

    const target = dto.status as OrderStatus;
    assertTransitionAllowed(order.status, target);

    const updated = await this.orders.transitionStatus({
      tenantId: principal.tenantId,
      orderId: order.id,
      from: order.status,
      to: target,
      changedByUserId: principal.userId,
      reason: dto.reason ?? 'Manual status change',
    });

    // The compare-and-swap failed even though the state machine allowed the move: somebody else
    // transitioned the order in between. Surfacing 409 lets the client reload and retry.
    if (!updated) {
      throw new ConflictError('The order status changed concurrently. Reload the order and try again.');
    }

    this.logger.log(`Order ${order.id} moved ${order.status} -> ${target} by user ${principal.userId}`);
    return updated;
  }

  async remove(principal: AuthenticatedUser, id: string): Promise<void> {
    const deleted = await this.orders.softDelete(principal.tenantId, id, this.ownership(principal));
    if (!deleted) throw new ResourceNotFoundError('Order');
    this.logger.log(`Order ${id} soft-deleted from tenant ${principal.tenantId}`);
  }

  /** Translates the caller's role into a repository-level ownership restriction. */
  private ownership(principal: AuthenticatedUser): Pick<FindOrderOptions, 'ownerUserId'> {
    return principal.role === USER_ROLE.ADMIN ? {} : { ownerUserId: principal.userId };
  }
}
