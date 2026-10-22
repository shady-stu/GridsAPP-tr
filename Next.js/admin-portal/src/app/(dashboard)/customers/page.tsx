import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listCustomersForCurrentTenant } from "@/lib/data/customers";
import { isCustomerStatus } from "@/lib/validation/customers";
import { CustomerTable } from "../dashboard/page";

export const metadata: Metadata = { title: "Customers | Grids Portal", description: "Search and manage workspace customers." };

export default async function CustomersPage({ searchParams }: PageProps<"/customers">) {
  const user = await requireUser();
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 100) : "";
  const status = typeof params.status === "string" && isCustomerStatus(params.status) ? params.status : "all";
  const all = await listCustomersForCurrentTenant();
  const filtered = all.filter((customer) => (!q || `${customer.name} ${customer.email} ${customer.company}`.toLowerCase().includes(q.toLowerCase())) && (status === "all" || customer.status === status));
  return <><div className="page-heading"><div><p className="eyebrow">YOUR WORKSPACE</p><h1>Customers</h1><p className="subheading">Manage and keep track of your customer relationships.</p></div>{user.role === "admin" && <Link href="/customers/new" className="button button-primary"><span>＋</span> Add customer</Link>}</div>
    <div className="list-toolbar"><form className="filters" action="/customers"><label className="search-box"><span aria-hidden="true">⌕</span><span className="sr-only">Search customers</span><input name="q" type="search" defaultValue={q} placeholder="Search customers..." /></label><label className="sr-only" htmlFor="status-filter">Filter by status</label><select id="status-filter" name="status" defaultValue={status}><option value="all">All statuses</option><option value="active">Active</option><option value="pending">Pending</option><option value="suspended">Suspended</option></select><button className="button button-secondary">Filter</button></form><span className="result-count">{filtered.length} {filtered.length === 1 ? "customer" : "customers"}</span></div>
    {params.created === "1" && <p className="success-banner" role="status">Customer created successfully.</p>}
    {params.error === "forbidden" && <p className="form-message" role="alert">Your viewer account cannot change customer data.</p>}
    {params.error === "not-found" && <p className="form-message" role="alert">That customer was not found in your workspace.</p>}
    {params.error === "invalid" && <p className="form-message" role="alert">The requested status update was invalid.</p>}
    {filtered.length ? <CustomerTable customers={filtered} /> : <div className="empty-state"><span>⌕</span><h2>No customers found</h2><p>Try a different search or clear the status filter.</p><Link href="/customers" className="text-link">Clear filters →</Link></div>}
  </>;
}
