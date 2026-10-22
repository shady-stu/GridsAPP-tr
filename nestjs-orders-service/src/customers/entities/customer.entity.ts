/**
 * Public shape of a customer.
 *
 * Deliberately a plain interface, not the Prisma model: application services must not depend
 * on generated types, and `Date` objects are kept as-is so the repository can hand back exactly
 * what the database returned (the DTO layer formats them for the wire).
 */
export interface CustomerRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly name: string;
  readonly email: string;
  readonly phone: string | null;
  readonly notes: string | null;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
