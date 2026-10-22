/**
 * Domain view of an identity.
 *
 * `UserRecord` is the safe projection (never contains the password hash). The repository
 * returns `UserWithCredentials` only from the credential-lookup method used by the login flow,
 * which keeps the hash out of every other code path by construction.
 */
import type { UserRole } from '../../common/interfaces/authenticated-user.interface.js';

export interface UserRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: UserRole;
  readonly isActive: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface UserWithCredentials extends UserRecord {
  /** scrypt digest produced by `PasswordService`. Never serialised to a client. */
  readonly passwordHash: string;
}

/** Principal lookup result used by the login flow, including the resolved tenant slug. */
export interface UserCredentialsWithTenant extends UserWithCredentials {
  readonly tenantSlug: string;
  readonly tenantName: string;
}
