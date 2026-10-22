/**
 * Customer use cases.
 *
 * Rules enforced here (not in the controller, not in the repository):
 *  * E-mail addresses are unique **within a tenant**; a duplicate yields `409 CONFLICT`
 *    instead of a raw unique-violation.
 *  * Deleting a customer that still has live orders is refused, because orders reference
 *    customers with `ON DELETE RESTRICT` and losing that link would corrupt order history.
 *    Deactivating the customer is the supported alternative.
 *  * A customer that does not exist in the caller's tenant is a `404` — never a `403`, so the
 *    endpoint cannot be used to probe other tenants.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { AuthenticatedUser } from '../common/interfaces/authenticated-user.interface.js';
import type { PaginatedResult } from '../common/interfaces/pagination.interface.js';
import { ConflictError, ResourceNotFoundError } from '../common/errors/domain-error.js';
import { normalisePageRequest } from '../common/utils/pagination.util.js';
import type { CustomerRecord } from './entities/customer.entity.js';
import {
  CUSTOMER_REPOSITORY,
  type CustomerRepository,
} from './repositories/customer.repository.js';
import type { CreateCustomerDto } from './dto/create-customer.dto.js';
import type { ListCustomersQueryDto } from './dto/list-customers.query.dto.js';
import type { UpdateCustomerDto } from './dto/update-customer.dto.js';

@Injectable()
export class CustomersService {
  private readonly logger = new Logger(CustomersService.name);

  constructor(@Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository) {}

  async create(principal: AuthenticatedUser, dto: CreateCustomerDto): Promise<CustomerRecord> {
    const existing = await this.customers.findByEmail(principal.tenantId, dto.email);
    if (existing) {
      throw new ConflictError(`A customer with e-mail ${dto.email} already exists`);
    }

    const created = await this.customers.create({
      tenantId: principal.tenantId,
      name: dto.name,
      email: dto.email,
      phone: dto.phone ?? null,
      notes: dto.notes ?? null,
    });

    this.logger.log(`Customer ${created.id} created in tenant ${principal.tenantId}`);
    return created;
  }

  list(tenantId: string, query: ListCustomersQueryDto): Promise<PaginatedResult<CustomerRecord>> {
    return this.customers.list({
      tenantId,
      search: query.search,
      isActive: query.isActive,
      page: normalisePageRequest({ page: query.page, pageSize: query.pageSize }),
    });
  }

  async getById(tenantId: string, id: string): Promise<CustomerRecord> {
    const customer = await this.customers.findById(tenantId, id);
    if (!customer) throw new ResourceNotFoundError('Customer');
    return customer;
  }

  async update(
    principal: AuthenticatedUser,
    id: string,
    dto: UpdateCustomerDto,
  ): Promise<CustomerRecord> {
    if (dto.email !== undefined) {
      const clash = await this.customers.findByEmail(principal.tenantId, dto.email);
      if (clash && clash.id !== id) {
        throw new ConflictError(`A customer with e-mail ${dto.email} already exists`);
      }
    }

    const updated = await this.customers.update(principal.tenantId, id, {
      name: dto.name,
      email: dto.email,
      phone: dto.phone,
      notes: dto.notes,
      isActive: dto.isActive,
    });
    if (!updated) throw new ResourceNotFoundError('Customer');

    this.logger.log(`Customer ${id} updated in tenant ${principal.tenantId}`);
    return updated;
  }

  async remove(principal: AuthenticatedUser, id: string): Promise<void> {
    // Resolve first so "not found" and "has orders" produce different, correct statuses.
    const customer = await this.getById(principal.tenantId, id);
    const orderCount = await this.customers.countOrders(principal.tenantId, customer.id);

    if (orderCount > 0) {
      throw new ConflictError(
        `Customer ${customer.id} still has ${orderCount} order(s) and cannot be deleted. ` +
          'Deactivate it with PATCH { "isActive": false } instead.',
      );
    }

    const deleted = await this.customers.delete(principal.tenantId, id);
    if (!deleted) throw new ResourceNotFoundError('Customer');
    this.logger.log(`Customer ${id} deleted from tenant ${principal.tenantId}`);
  }
}
