import type { Role, User } from "@/lib/types";

export class AuthError extends Error {
  readonly code: "unauthenticated" | "forbidden" | "configuration";

  constructor(code: "unauthenticated" | "forbidden" | "configuration") {
    super(code === "unauthenticated" ? "Sign in is required." : code === "forbidden" ? "Administrator access is required." : "Demo authentication is not configured.");
    this.name = "AuthError";
    this.code = code;
  }
}

export function requireAuthenticatedUser(user: User | null): User {
  if (!user) throw new AuthError("unauthenticated");
  return user;
}

export function requireUserRole(user: User, required: Role): User {
  if (user.role !== required) throw new AuthError("forbidden");
  return user;
}
