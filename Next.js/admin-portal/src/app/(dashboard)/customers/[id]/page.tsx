import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { updateCustomerStatus } from "@/app/actions/customers";
import { requireUser } from "@/lib/auth";
import { getCustomerForCurrentTenant } from "@/lib/data/customers";
import { StatusBadge } from "../../dashboard/page";

export const metadata: Metadata = { title: "Customer details | Grids Portal", description: "View customer details." };

export default async function CustomerDetailPage({ params, searchParams }: PageProps<"/customers/[id]">) {
  const [{ id }, user, query] = await Promise.all([params, requireUser(), searchParams]);
  const customer = await getCustomerForCurrentTenant(id);
  if (!customer) notFound();
  return <><Link href="/customers" className="back-link">← Back to customers</Link><div className="detail-heading"><div className="detail-identity"><span className="avatar avatar-large">{customer.name.split(" ").map((part) => part[0]).join("")}</span><div><p className="eyebrow">CUSTOMER PROFILE</p><h1>{customer.name}</h1><p className="subheading">{customer.company}</p></div></div><StatusBadge status={customer.status} /></div>{query.updated === "1" && <p className="success-banner" role="status">Customer status updated successfully.</p>}<div className="detail-grid"><section className="detail-card"><div className="section-title"><div><h2>Customer information</h2><p>Contact and account details</p></div></div><dl className="info-list"><div><dt>Email address</dt><dd><a href={`mailto:${customer.email}`}>{customer.email}</a></dd></div><div><dt>Company</dt><dd>{customer.company}</dd></div><div><dt>Customer ID</dt><dd className="mono">{customer.id}</dd></div><div><dt>Added on</dt><dd>{new Date(`${customer.createdAt}T12:00:00`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</dd></div></dl></section>{user.role === "admin" && <section className="detail-card"><div className="section-title"><div><h2>Update status</h2><p>Change this customer&apos;s account status.</p></div></div><form action={updateCustomerStatus} className="status-form"><input type="hidden" name="id" value={customer.id} /><label htmlFor="customer-status">Status</label><select id="customer-status" name="status" defaultValue={customer.status}><option value="active">Active</option><option value="pending">Pending</option><option value="suspended">Suspended</option></select><button className="button button-secondary">Save status</button></form></section>}</div></>;
}
