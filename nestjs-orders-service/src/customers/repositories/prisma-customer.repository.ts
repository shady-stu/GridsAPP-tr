/**
 * Prisma-backed implementation of the customer repository.
 *
 * Responsibilities are intentionally narrow: translate between the domain records and Prisma,
 * and map Prisma failures onto domain errors. No business rules live here — "is this e-mail
 * already taken?" is decided by `CustomersService`, which asks this adapter.
 */
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { mapPrismaErrorToDomainError } from '../../common/errors/prisma-error.mapper.js';
import {
  toPaginatedResult,
  type PaginatedResult,
} from '../../common/interfaces/pagination.interface.js';
import { toSkipTake } from '../../common/utils/pagination.util.js';
import type { Customer, Prisma } from '../../generated/prisma/client.js';
import type { CustomerRecord } from '../entities/customer.entity.js';
import type {
  CreateCustomerData,
  CustomerRepository,
  ListCustomersFilter,
  UpdateCustomerData,
} from './customer.repository.js';

@Injectable()
export class PrismaCustomerRepository implements CustomerRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateCustomerData): Promise<CustomerRecord> {
    try {
      const row = await this.prisma.customer.create({
        data: {
          tenantId: data.tenantId,
          name: data.name,
          email: data.email,
          phone: data.phone ?? null,
          notes: data.notes ?? null,
        },
      });
      return toCustomerRecord(row);
    } catch (error) {
      // A unique-violation becomes a 409 `CONFLICT` instead of an opaque 500.
      throw mapPrismaErrorToDomainError(error, 'Customer') ?? error;
    }
  }

  async findById(tenantId: string, id: string): Promise<CustomerRecord | null> {
    // `findFirst` (not `findUnique`) because the tenant is part of the filter.
    const row = await this.prisma.customer.findFirst({ where: { id, tenantId } });
    return row ? toCustomerRecord(row) : null;
  }

  async findByEmail(tenantId: string, email: string): Promise<CustomerRecord | null> {
    const row = await this.prisma.customer.findUnique({
      where: { tenantId_email: { tenantId, email } },
    });
    return row ? toCustomerRecord(row) : null;
  }

  async update(
    tenantId: string,
    id: string,
    data: UpdateCustomerData,
  ): Promise<CustomerRecord | null> {
    try {
      // `updateMany` scopes by tenant and reports how many rows matched, so a customer that
      // belongs to another tenant is indistinguishable from one that does not exist.
      const result = await this.prisma.customer.updateMany({
        where: { id, tenantId },
        data: {
          ...(data.name === undefined ? {} : { name: data.name }),
          ...(data.email === undefined ? {} : { email: data.email }),
          ...(data.phone === undefined ? {} : { phone: data.phone }),
          ...(data.notes === undefined ? {} : { notes: data.notes }),
          ...(data.isActive === undefined ? {} : { isActive: data.isActive }),
        },
      });
      if (result.count === 0) return null;
      return this.findById(tenantId, id);
    } catch (error) {
      throw mapPrismaErrorToDomainError(error, 'Customer') ?? error;
    }
  }

  async delete(tenantId: string, id: string): Promise<boolean> {
    const result = await this.prisma.customer.deleteMany({ where: { id, tenantId } });
    return result.count > 0;
  }

  async list(filter: ListCustomersFilter): Promise<PaginatedResult<CustomerRecord>> {
    const where: Prisma.CustomerWhereInput = {
      tenantId: filter.tenantId,
      ...(filter.isActive === undefined ? {} : { isActive: filter.isActive }),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { email: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    // One round trip for both the page and the total count.
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.customer.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        ...toSkipTake(filter.page),
      }),
      this.prisma.customer.count({ where }),
    ]);

    return toPaginatedResult(rows.map(toCustomerRecord), total, filter.page);
  }

  async countOrders(tenantId: string, customerId: string): Promise<number> {
    return this.prisma.order.count({
      where: { tenantId, customerId, deletedAt: null },
    });
  }
}

/** Database row -> domain record. Kept as a free function so it is trivially unit-testable. */
export function toCustomerRecord(row: Customer): CustomerRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    name: row.name,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    isActive: row.isActive,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
