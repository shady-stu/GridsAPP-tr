/**
 * Database fixtures for the integration and E2E suites.
 *
 * The helpers write rows directly through Prisma rather than through the HTTP API. That is
 * deliberate: a test's *precondition* should not depend on the behaviour under test. The API
 * paths themselves are covered by E2E tests; here we only need trustworthy starting data.
 */
import { hashPassword } from '../../src/auth/password-hash.js';
import type { PrismaService } from '../../src/database/prisma.service.js';
import { Prisma } from '../../src/generated/prisma/client.js';
import type { Customer, Order, Tenant, User } from '../../src/generated/prisma/client.js';
import type { OrderStatus, UserRole } from '../../src/generated/prisma/enums.js';

/**
 * Every tenant-scoped table, child-first. `TRUNCATE ... CASCADE` would cover the dependencies
 * anyway, but listing them all keeps the intent obvious and makes the list greppable when a new
 * table is added. `_prisma_migrations` is never touched.
 */
const TRUNCATABLE_TABLES = [
  'order_status_history',
  'orders',
  'customers',
  'webhook_events',
  'users',
  'tenants',
] as const;

/**
 * Empty the database between tests and reset identity sequences.
 *
 * Table names are compile-time constants, never user input, so interpolating them here introduces
 * no injection surface (and `$executeRawUnsafe` is the only Prisma API that accepts multiple
 * statements).
 */
export async function truncateAll(prisma: PrismaService): Promise<void> {
  const tables = TRUNCATABLE_TABLES.map((table) => `"${table}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
}

export async function createTenant(
  prisma: PrismaService,
  data: { slug: string; name?: string },
): Promise<Tenant> {
  return prisma.tenant.create({
    data: { slug: data.slug, name: data.name ?? data.slug },
  });
}

export async function createUser(
  prisma: PrismaService,
  tenantId: string,
  data: {
    email: string;
    role?: UserRole;
    password?: string;
    displayName?: string;
    isActive?: boolean;
  },
): Promise<User> {
  return prisma.user.create({
    data: {
      tenantId,
      email: data.email,
      displayName: data.displayName ?? data.email,
      passwordHash: await hashPassword(data.password ?? 'Passw0rd!demo'),
      role: data.role ?? 'USER',
      isActive: data.isActive ?? true,
    },
  });
}

export async function createCustomer(
  prisma: PrismaService,
  tenantId: string,
  data: { email: string; name?: string; phone?: string; notes?: string; isActive?: boolean },
): Promise<Customer> {
  return prisma.customer.create({
    data: {
      tenantId,
      email: data.email,
      name: data.name ?? data.email,
      phone: data.phone ?? null,
      notes: data.notes ?? null,
      isActive: data.isActive ?? true,
    },
  });
}

export async function createOrder(
  prisma: PrismaService,
  data: {
    tenantId: string;
    customerId: string;
    userId: string;
    totalAmount?: string;
    currency?: string;
    status?: OrderStatus;
    reference?: string | null;
    notes?: string | null;
    deletedAt?: Date | null;
  },
): Promise<Order> {
  return prisma.order.create({
    data: {
      tenantId: data.tenantId,
      customerId: data.customerId,
      userId: data.userId,
      // A string is passed to `Decimal`, so no binary floating point is involved.
      totalAmount: new Prisma.Decimal(data.totalAmount ?? '100.00'),
      currency: data.currency ?? 'USD',
      status: data.status ?? 'PENDING',
      reference: data.reference ?? null,
      notes: data.notes ?? null,
      deletedAt: data.deletedAt ?? null,
    },
  });
}
