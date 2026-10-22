import "server-only";

import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { User } from "@/lib/types";
import { AuthError, requireAuthenticatedUser, requireUserRole } from "@/lib/auth/policy";
import { createSignedSession, verifySignedSession } from "@/lib/auth/session";

export { AuthError } from "@/lib/auth/policy";

const COOKIE_NAME = "grids_demo_session";
const SESSION_LIFETIME_SECONDS = 60 * 60 * 8;
const LOCAL_SESSION_SECRET = "local-only-change-this-demo-session-secret";

type DemoAccount = User & { accessCode: string };
function accounts(): DemoAccount[] {
  const production = process.env.NODE_ENV === "production";
  const adminCode = process.env.DEMO_ADMIN_CODE || (production ? "" : "admin-demo");
  const viewerCode = process.env.DEMO_VIEWER_CODE || (production ? "" : "viewer-demo");
  if (!adminCode || !viewerCode || (production && (adminCode.length < 16 || viewerCode.length < 16))) throw new AuthError("configuration");
  return [
    { id: "demo-admin", name: "Alex Morgan", email: "admin@northstar.example", role: "admin", tenantId: "tenant-northstar", accessCode: adminCode },
    { id: "demo-viewer", name: "Sam Taylor", email: "viewer@northstar.example", role: "viewer", tenantId: "tenant-northstar", accessCode: viewerCode },
  ];
}

function sessionSecret(): string {
  const configured = process.env.DEMO_SESSION_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === "production") throw new AuthError("configuration");
  return LOCAL_SESSION_SECRET;
}

function makeCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_LIFETIME_SECONDS,
  };
}

/** Authenticate the submitted demo code, but derive role and tenant only from this server-side account list. */
export async function loginDemoUser(email: string, accessCode: string): Promise<void> {
  const configuredAccounts = accounts();
  const normalizedEmail = email.trim().toLowerCase();
  const account = configuredAccounts.find((item) => item.email === normalizedEmail);
  const codeToCheck = account?.accessCode ?? "invalid-demo-access-code";
  if (!account || accessCode.length !== codeToCheck.length || !equalAccessCode(accessCode, codeToCheck)) throw new AuthError("unauthenticated");

  const store = await cookies();
  const token = createSignedSession(account.id, Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS, sessionSecret());
  store.set(COOKIE_NAME, token, makeCookieOptions());
}

export async function logoutDemoUser(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}

/** Verify the HMAC and expiry, then look up role and tenant from trusted server-side configuration. */
export async function getCurrentUser(): Promise<User | null> {
  const token = (await cookies()).get(COOKIE_NAME)?.value;
  if (!token) return null;

  await connection();
  try {
    const session = verifySignedSession(token, sessionSecret());
    if (!session) return null;
    const account = accounts().find((item) => item.id === session.sub);
    if (!account) return null;
    return { id: account.id, name: account.name, email: account.email, role: account.role, tenantId: account.tenantId };
  } catch (error) {
    if (error instanceof AuthError && error.code === "configuration") throw error;
    return null;
  }
}

function equalAccessCode(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function requireUser(): Promise<User> {
  return requireAuthenticatedUser(await getCurrentUser());
}

export async function requireRole(required: User["role"]): Promise<User> {
  return requireUserRole(await requireUser(), required);
}
