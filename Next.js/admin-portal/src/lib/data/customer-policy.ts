import type { Customer, User } from "@/lib/types";

export function customersForTenant(records: Customer[], user: User): Customer[] {
  return records.filter((customer) => customer.tenantId === user.tenantId);
}

export function customerForTenant(records: Customer[], user: User, id: string): Customer | undefined {
  return records.find((customer) => customer.id === id && customer.tenantId === user.tenantId);
}
