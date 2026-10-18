import "server-only";
import { randomUUID } from "node:crypto";
import { requireRole, requireUser } from "@/lib/auth";
import { customerForTenant, customersForTenant } from "@/lib/data/customer-policy";
import type { Customer, CustomerStatus } from "@/lib/types";

// In-memory data is deterministic for this demo and is neither persistent nor multi-process safe.
const customers: Customer[] = [
  { id: "cus_1001", tenantId: "tenant-northstar", name: "Olivia Chen", email: "olivia@northstar.example", company: "Northstar Labs", status: "active", createdAt: "2026-09-18" },
  { id: "cus_1002", tenantId: "tenant-northstar", name: "Marcus Johnson", email: "marcus@northstar.example", company: "Northstar Labs", status: "pending", createdAt: "2026-09-22" },
  { id: "cus_1003", tenantId: "tenant-northstar", name: "Priya Patel", email: "priya@northstar.example", company: "Meridian Studio", status: "active", createdAt: "2026-10-02" },
  { id: "cus_1004", tenantId: "tenant-northstar", name: "Ethan Williams", email: "ethan@northstar.example", company: "Meridian Studio", status: "suspended", createdAt: "2026-10-08" },
  { id: "cus_1005", tenantId: "tenant-northstar", name: "Sofia Garcia", email: "sofia@northstar.example", company: "Fieldwork Co.", status: "active", createdAt: "2026-10-11" },
  { id: "cus_2001", tenantId: "tenant-atlas", name: "Taylor Example", email: "private@atlas.example", company: "Atlas Group", status: "active", createdAt: "2026-10-01" },
];

export async function listCustomersForCurrentTenant(): Promise<Customer[]> {
  const user = await requireUser();
  return customersForTenant(customers, user).map((customer) => ({ ...customer }));
}

export async function getCustomerForCurrentTenant(id: string): Promise<Customer | undefined> {
  const user = await requireUser();
  const customer = customerForTenant(customers, user, id);
  return customer ? { ...customer } : undefined;
}

export async function createCustomerForCurrentTenant(input: Omit<Customer, "id" | "tenantId" | "createdAt">): Promise<Customer> {
  const user = await requireRole("admin");
  const customer: Customer = { ...input, id: `cus_${randomUUID().replaceAll("-", "").slice(0, 12)}`, tenantId: user.tenantId, createdAt: new Date().toISOString().slice(0, 10) };
  customers.unshift(customer);
  return { ...customer };
}

export async function updateCustomerStatusForCurrentTenant(id: string, status: CustomerStatus): Promise<boolean> {
  const user = await requireRole("admin");
  const customer = customerForTenant(customers, user, id);
  if (!customer) return false;
  customer.status = status;
  return true;
}
