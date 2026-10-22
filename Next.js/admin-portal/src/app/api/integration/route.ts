import { AuthError, requireRole } from "@/lib/auth";
import { listCustomersForCurrentTenant } from "@/lib/data/customers";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  if (url.searchParams.size > (status ? 1 : 0) || (status && !["active", "pending", "suspended"].includes(status))) {
    return Response.json({ error: "Invalid query. Supported parameter: status=active|pending|suspended." }, { status: 400, headers: { "Cache-Control": "private, no-store" } });
  }
  try {
    await requireRole("admin");
    const customers = await listCustomersForCurrentTenant();
    const filtered = status ? customers.filter((customer) => customer.status === status) : customers;
    return Response.json({ data: { total: filtered.length, customers: filtered.map(({ id, name, company, status: customerStatus }) => ({ id, name, company, status: customerStatus })) } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AuthError && error.code === "unauthenticated") {
      return Response.json({ error: "Authentication required." }, { status: 401, headers: { "Cache-Control": "private, no-store", "WWW-Authenticate": "Session" } });
    }
    if (error instanceof AuthError && error.code === "forbidden") {
      return Response.json({ error: "Administrator access required." }, { status: 403, headers: { "Cache-Control": "private, no-store" } });
    }
    return Response.json({ error: "Integration service unavailable." }, { status: 500, headers: { "Cache-Control": "private, no-store" } });
  }
}
