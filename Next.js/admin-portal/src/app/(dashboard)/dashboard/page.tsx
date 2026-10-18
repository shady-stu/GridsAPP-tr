import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { listCustomersForCurrentTenant } from "@/lib/data/customers";

export const metadata: Metadata = { title: "Overview | Grids Portal", description: "Customer workspace overview." };

export default function DashboardPage() {
  return <Suspense fallback={<div className="loading-state" role="status"><span className="spinner" />Loading dashboard overview…</div>}><DashboardContent /></Suspense>;
}

async function DashboardContent() {
  const user = await requireUser();
  const customers = await listCustomersForCurrentTenant();
  const active = customers.filter((customer) => customer.status === "active").length;
  const pending = customers.filter((customer) => customer.status === "pending").length;
  const recent = customers.slice(0, 4);
  return <>
    <div className="page-heading"><div><p className="eyebrow">MONDAY, OCTOBER 17, 2026</p><h1>Good morning, {user.name.split(" ")[0]} <span className="wave">✳</span></h1><p className="subheading">Here&apos;s what&apos;s happening with your workspace today.</p></div>{user.role === "admin" && <Link href="/customers/new" className="button button-primary"><span>＋</span> Add customer</Link>}</div>
    <section className="metrics" aria-label="Customer summary"><Metric label="Total customers" value={customers.length} note="Across your workspace" icon="♙" color="purple" /><Metric label="Active customers" value={active} note="Currently active" icon="↗" color="green" /><Metric label="Pending review" value={pending} note="Awaiting activation" icon="◷" color="amber" /></section>
    <div className="section-title"><div><h2>Recent customers</h2><p>Your latest customer activity</p></div><Link href="/customers" className="text-link">View all customers <span>→</span></Link></div>
    <CustomerTable customers={recent} />
    {user.role === "admin" && <section className="banner"><div className="banner-icon">✦</div><div><h3>Your workspace is looking good</h3><p>You&apos;re all caught up. Add your next customer when you&apos;re ready.</p></div><Link href="/customers/new" className="text-link">Add customer <span>→</span></Link></section>}
  </>;
}

function Metric({ label, value, note, icon, color }: { label: string; value: number; note: string; icon: string; color: string }) {
  return <article className="metric-card"><div className="metric-top"><span>{label}</span><span className={`metric-icon ${color}`}>{icon}</span></div><strong className="metric-value">{value.toString().padStart(2, "0")}</strong><div className="metric-note"><span className="dot" />{note}</div></article>;
}

export function CustomerTable({ customers }: { customers: Awaited<ReturnType<typeof listCustomersForCurrentTenant>> }) {
  return <div className="table-wrap"><table><thead><tr><th>Customer</th><th>Company</th><th>Status</th><th>Added</th><th><span className="sr-only">Open customer</span></th></tr></thead><tbody>{customers.map((customer) => <tr key={customer.id}><td><Link className="customer-cell" href={`/customers/${customer.id}`}><span className="avatar avatar-customer">{customer.name.split(" ").map((part) => part[0]).join("")}</span><span><strong>{customer.name}</strong><small>{customer.email}</small></span></Link></td><td>{customer.company}</td><td><StatusBadge status={customer.status} /></td><td>{new Date(`${customer.createdAt}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</td><td><Link className="row-link" href={`/customers/${customer.id}`} aria-label={`View ${customer.name}`}>↗</Link></td></tr>)}</tbody></table></div>;
}

export function StatusBadge({ status }: { status: "active" | "pending" | "suspended" }) {
  return <span className={`status status-${status}`}><span />{status[0].toUpperCase() + status.slice(1)}</span>;
}
