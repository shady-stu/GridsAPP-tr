/**
 * Persistence contract for customers.
 *
 * Every method takes `tenantId` as its first argument. That is not decoration: it is the
 * mechanism that makes cross-tenant reads impossible, because the adapter builds the SQL
 * `WHERE` clause from it. A controller can therefore never accidentally expose another
 * tenant's rows by forgetting a filter.
 */
import { REPOSITORY_TOKENS } from '../../common/constants.js';
import type {
  PageRequest,
  PaginatedResult,
} from '../../common/interfaces/pagination.interface.js';
import type { CustomerRecord } from '../entities/customer.entity.js';

export const CUSTOMER_REPOSITORY = REPOSITORY_TOKENS.CUSTOMER;

export interface CreateCustomerData {
  tenantId: string;
  name: string;
  /** Already normalised (trimmed, lower-cased) by the DTO layer. */
  email: string;
  phone?: string | null;
  notes?: string | null;
}

export interface UpdateCustomerData {
  name?: string;
  email?: string;
  phone?: string | null;
  notes?: string | null;
  isActive?: boolean;
}

export interface ListCustomersFilter {
  tenantId: string;
  /** Case-insensitive match against name or email. */
  search?: string;
  isActive?: boolean;
  page: PageRequest;
}

export interface CustomerRepository {
  create(data: CreateCustomerData): Promise<CustomerRecord>;

  findById(tenantId: string, id: string): Promise<CustomerRecord | null>;

  /** Used to produce a 409 instead of a database-level unique violation. */
  findByEmail(tenantId: string, email: string): Promise<CustomerRecord | null>;

  update(tenantId: string, id: string, data: UpdateCustomerData): Promise<CustomerRecord | null>;

  /** Returns `false` when the customer does not exist in this tenant. */
  delete(tenantId: string, id: string): Promise<boolean>;

  list(filter: ListCustomersFilter): Promise<PaginatedResult<CustomerRecord>>;

  /** Number of *live* (not soft-deleted) orders referencing the customer. */
  countOrders(tenantId: string, customerId: string): Promise<number>;
}
