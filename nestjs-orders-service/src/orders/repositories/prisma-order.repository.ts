/**
 * Prisma-backed implementation of the order repository.
 *
 * The only place in the codebase that turns Prisma's `Decimal` into the domain's decimal string,
 * and the only place that knows about the `webhook_events`-style soft-delete column.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { mapPrismaErrorToDomainError } from '../../common/errors/prisma-error.mapper.js';
import {
  toPaginatedResult,
  type PaginatedResult,
} from '../../common/interfaces/pagination.interface.js';
import { toSkipTake } from '../../common/utils/pagination.util.js';
import { Prisma, type Order, type OrderStatusHistory } from '../../generated/prisma/client.js';
import type { OrderRecord, OrderStatusHistoryRecord, OrderWithHistory } from '../entities/order.entity.js';
import type {
  CreateOrderData,
  FindOrderOptions,
  ListOrdersFilter,
  OrderRepository,
  TransitionStatusParams,
  UpdateOrderData,
} from './order.repository.js';

@Injectable()
export class PrismaOrderRepository implements OrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateOrderData): Promise<OrderRecord> {
    try {
      const row = await this.prisma.order.create({
        data: {
          tenantId: data.tenantId,
          customerId: data.customerId,
          userId: data.userId,
          // A string is passed straight through; Prisma converts it to DECIMAL(14,2) without
          // ever going near a JavaScript float.
          totalAmount: new Prisma.Decimal(data.totalAmount),
          currency: data.currency,
          reference: data.reference ?? null,
          notes: data.notes ?? null,
          // The creation itself is the first audit entry, written in the same statement.
          history: {
            create: {
              fromStatus: null,
              toStatus: 'PENDING',
              changedByUserId: data.userId,
              reason: 'Order created',
            },
          },
        },
      });
      return toOrderRecord(row);
    } catch (error) {
      // Covers "customer does not exist in this tenant" (FK violation) and
      // "reference already used by a live order" (partial unique index).
      throw mapPrismaErrorToDomainError(error, 'Order') ?? error;
    }
  }

  async findById(
    tenantId: string,
    id: string,
    options: FindOrderOptions = {},
  ): Promise<OrderRecord | null> {
    const row = await this.prisma.order.findFirst({
      where: this.buildWhere(tenantId, id, options),
    });
    return row ? toOrderRecord(row) : null;
  }

  async findWithHistory(
    tenantId: string,
    id: string,
    options: FindOrderOptions = {},
  ): Promise<OrderWithHistory | null> {
    const row = await this.prisma.order.findFirst({
      where: this.buildWhere(tenantId, id, options),
      include: { history: { orderBy: [{ changedAt: 'asc' }, { id: 'asc' }] } },
    });
    if (!row) return null;
    const { history, ...order } = row;
    return { ...toOrderRecord(order), history: history.map(toHistoryRecord) };
  }

  async update(
    tenantId: string,
    id: string,
    data: UpdateOrderData,
    options: FindOrderOptions = {},
  ): Promise<OrderRecord | null> {
    try {
      // `updateMany` instead of `update` so tenant/ownership filters and "row not found" can be
      // expressed in a single statement.
      const result = await this.prisma.order.updateMany({
        where: this.buildWhere(tenantId, id, options),
        data: {
          ...(data.reference === undefined ? {} : { reference: data.reference }),
          ...(data.notes === undefined ? {} : { notes: data.notes }),
        },
      });
      if (result.count === 0) return null;
      return this.findById(tenantId, id, options);
    } catch (error) {
      throw mapPrismaErrorToDomainError(error, 'Order') ?? error;
    }
  }

  async softDelete(tenantId: string, id: string, options: FindOrderOptions = {}): Promise<boolean> {
    const result = await this.prisma.order.updateMany({
      where: { ...this.buildWhere(tenantId, id, options), deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return result.count > 0;
  }

  async list(filter: ListOrdersFilter): Promise<PaginatedResult<OrderRecord>> {
    const where: Prisma.OrderWhereInput = {
      tenantId: filter.tenantId,
      ...(filter.status === undefined ? {} : { status: filter.status }),
      ...(filter.customerId === undefined ? {} : { customerId: filter.customerId }),
      ...(filter.ownerUserId === undefined ? {} : { userId: filter.ownerUserId }),
      ...(filter.includeDeleted ? {} : { deletedAt: null }),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        // `id` is the tie-breaker so paging is stable when several rows share a timestamp.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...toSkipTake(filter.page),
      }),
      this.prisma.order.count({ where }),
    ]);

    return toPaginatedResult(rows.map(toOrderRecord), total, filter.page);
  }

  async transitionStatus(params: TransitionStatusParams): Promise<OrderRecord | null> {
    return this.prisma.$transaction(async (tx) => {
      // Compare-and-swap: the row is only updated while it still holds the expected status, so
      // two concurrent requests (e.g. a manual change and a webhook) cannot both "win".
      const result = await tx.order.updateMany({
        where: {
          id: params.orderId,
          tenantId: params.tenantId,
          status: params.from,
          deletedAt: null,
          ...(params.ownerUserId ? { userId: params.ownerUserId } : {}),
        },
        data: { status: params.to },
      });

      if (result.count === 0) return null;

      // Same transaction as the update: the audit trail can never disagree with the row.
      await tx.orderStatusHistory.create({
        data: {
          orderId: params.orderId,
          fromStatus: params.from,
          toStatus: params.to,
          changedByUserId: params.changedByUserId ?? null,
          reason: params.reason ?? null,
        },
      });

      const row = await tx.order.findUnique({ where: { id: params.orderId } });
      return row ? toOrderRecord(row) : null;
    });
  }

  async findAcrossTenantsById(id: string): Promise<OrderRecord | null> {
    const row = await this.prisma.order.findUnique({ where: { id } });
    return row ? toOrderRecord(row) : null;
  }

  /** Shared predicate: tenant + id + optional ownership + soft-delete visibility. */
  private buildWhere(tenantId: string, id: string, options: FindOrderOptions): Prisma.OrderWhereInput {
    return {
      id,
      tenantId,
      ...(options.ownerUserId === undefined ? {} : { userId: options.ownerUserId }),
      ...(options.includeDeleted ? {} : { deletedAt: null }),
    };
  }
}

/** Database row -> domain record. Money becomes a fixed 2-decimal string. */
export function toOrderRecord(row: Order): OrderRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    customerId: row.customerId,
    userId: row.userId,
    status: row.status,
    totalAmount: row.totalAmount.toFixed(2),
    // `currency` is CHAR(3); trimming defends against any driver-level padding.
    currency: row.currency.trim(),
    reference: row.reference,
    notes: row.notes,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toHistoryRecord(row: OrderStatusHistory): OrderStatusHistoryRecord {
  return {
    id: row.id,
    orderId: row.orderId,
    fromStatus: row.fromStatus,
    toStatus: row.toStatus,
    changedByUserId: row.changedByUserId,
    reason: row.reason,
    changedAt: row.changedAt,
  };
}
