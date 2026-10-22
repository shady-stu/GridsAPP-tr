import assert from "node:assert/strict";
import test from "node:test";
import { AuthError, requireAuthenticatedUser, requireUserRole } from "../src/lib/auth/policy.ts";
import { createSignedSession, verifySignedSession } from "../src/lib/auth/session.ts";
import { customerForTenant, customersForTenant } from "../src/lib/data/customer-policy.ts";
import { isCustomerStatus, validateCustomer } from "../src/lib/validation/customers.ts";

const admin = { id: "admin", name: "Admin", email: "admin@example.test", role: "admin", tenantId: "tenant-a" };
const viewer = { id: "viewer", name: "Viewer", email: "viewer@example.test", role: "viewer", tenantId: "tenant-a" };
const records = [
  { id: "cus_a", tenantId: "tenant-a", name: "A Customer", email: "a@example.test", company: "A Company", status: "active", createdAt: "2026-01-01" },
  { id: "cus_b", tenantId: "tenant-b", name: "B Customer", email: "b@example.test", company: "B Company", status: "active", createdAt: "2026-01-01" },
];

test("unauthenticated access is rejected", () => {
  assert.throws(() => requireAuthenticatedUser(null), (error) => error instanceof AuthError && error.code === "unauthenticated");
});

test("signed sessions reject tampering and expired tokens", () => {
  const token = createSignedSession("demo-admin", 2_000, "test-session-secret-at-least-32-characters");
  assert.deepEqual(verifySignedSession(token, "test-session-secret-at-least-32-characters", 1_000), { sub: "demo-admin", exp: 2_000 });
  assert.equal(verifySignedSession(`${token}x`, "test-session-secret-at-least-32-characters", 1_000), null);
  assert.equal(verifySignedSession(token, "another-test-session-secret-value-32", 1_000), null);
  assert.equal(verifySignedSession(token, "test-session-secret-at-least-32-characters", 2_000), null);
});

test("viewer cannot satisfy admin authorization", () => {
  assert.equal(requireUserRole(admin, "admin"), admin);
  assert.throws(() => requireUserRole(viewer, "admin"), (error) => error instanceof AuthError && error.code === "forbidden");
});

test("customer list and detail lookups stay within the current tenant", () => {
  assert.deepEqual(customersForTenant(records, admin).map((customer) => customer.id), ["cus_a"]);
  assert.equal(customerForTenant(records, admin, "cus_b"), undefined);
  assert.equal(customerForTenant(records, admin, "cus_a")?.tenantId, admin.tenantId);
});

test("create input and status values reject malformed values", () => {
  assert.deepEqual(validateCustomer({ name: " ", email: "not-an-email", company: "x" }), {
    name: "Enter a name between 2 and 80 characters.",
    email: "Enter a valid email address.",
    company: "Enter a company between 2 and 100 characters.",
  });
  assert.equal(isCustomerStatus("active"), true);
  assert.equal(isCustomerStatus("owner"), false);
});
