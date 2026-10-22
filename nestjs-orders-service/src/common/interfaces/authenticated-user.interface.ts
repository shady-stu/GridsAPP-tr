/**
 * The authenticated principal, derived exclusively from a verified access token.
 *
 * Nothing in the HTTP request body, query string or path is ever trusted to supply
 * `userId`, `tenantId` or `role` — see `JwtAuthGuard` and `docs/SECURITY.md`.
 */
export interface AuthenticatedUser {
  /** Subject: the user's primary key. */
  readonly userId: string;
  /** The tenant the user belongs to. Every data access is scoped by this value. */
  readonly tenantId: string;
  /** Tenant-unique email, carried for logging only. */
  readonly email: string;
  /** Authorization role. */
  readonly role: UserRole;
}

/** Roles recognised by the authorization layer. */
export const USER_ROLE = {
  ADMIN: 'ADMIN',
  USER: 'USER',
} as const;

export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];

export const USER_ROLES: readonly UserRole[] = Object.values(USER_ROLE);

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (USER_ROLES as readonly string[]).includes(value);
}

/** Minimal shape attached to the Express request by the auth guard. */
export interface RequestWithUser {
  user?: AuthenticatedUser;
  headers: Record<string, string | string[] | undefined>;
}
