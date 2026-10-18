/**
 * Persistence contract for identities.
 *
 * Application services depend on this interface (via the `USER_REPOSITORY` token), never on
 * Prisma. That is what makes `AuthService` unit-testable with a hand-written fake and what
 * allows the storage engine to change without touching business rules.
 */
import type { UserCredentialsWithTenant, UserRecord, UserWithCredentials } from '../entities/user.entity.js';
import type { UserRole } from '../../common/interfaces/authenticated-user.interface.js';
import { REPOSITORY_TOKENS } from '../../common/constants.js';

export const USER_REPOSITORY = REPOSITORY_TOKENS.USER;

export interface CreateUserData {
  tenantId: string;
  email: string;
  displayName: string;
  passwordHash: string;
  role?: UserRole;
}

export interface UserRepository {
  /**
   * Credential lookup for login. Resolves the tenant from its slug in the same query so a
   * login attempt cannot be used to probe which tenants exist.
   */
  findCredentialsByTenantSlug(tenantSlug: string, email: string): Promise<UserCredentialsWithTenant | null>;

  /** Tenant-scoped lookup by primary key. */
  findById(tenantId: string, id: string): Promise<UserRecord | null>;

  findByIdWithCredentials(tenantId: string, id: string): Promise<UserWithCredentials | null>;

  create(data: CreateUserData): Promise<UserRecord>;

  countByTenant(tenantId: string): Promise<number>;
}
