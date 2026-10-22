import type { CustomerStatus } from "@/lib/types";

export type CustomerInput = { name: string; email: string; company: string };
export type CustomerErrors = Partial<Record<keyof CustomerInput, string>>;

export function validateCustomer(input: CustomerInput): CustomerErrors {
  const errors: CustomerErrors = {};
  if (input.name.length < 2 || input.name.length > 80) errors.name = "Enter a name between 2 and 80 characters.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email) || input.email.length > 254) errors.email = "Enter a valid email address.";
  if (input.company.length < 2 || input.company.length > 100) errors.company = "Enter a company between 2 and 100 characters.";
  return errors;
}

export function isCustomerStatus(value: string): value is CustomerStatus {
  return value === "active" || value === "pending" || value === "suspended";
}
