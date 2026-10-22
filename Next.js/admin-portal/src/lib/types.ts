export type Role = "admin" | "viewer";
export type CustomerStatus = "active" | "pending" | "suspended";

export type User = { id: string; name: string; email: string; role: Role; tenantId: string };
export type Customer = {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  company: string;
  status: CustomerStatus;
  createdAt: string;
};
