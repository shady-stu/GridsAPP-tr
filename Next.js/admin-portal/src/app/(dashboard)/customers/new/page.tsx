import type { Metadata } from "next";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { CreateCustomerForm } from "@/components/create-customer-form";

export const metadata: Metadata = { title: "Add customer | Grids Portal", description: "Add a customer to your workspace." };

export default async function NewCustomerPage() {
  const user = await requireUser();
  if (user.role !== "admin") {
    return <><Link href="/customers" className="back-link">← Back to customers</Link><div className="empty-state"><span>◉</span><h1>Read-only access</h1><p>Your viewer role can browse customers but cannot add or edit them.</p><Link href="/customers" className="button button-secondary">View customers</Link></div></>;
  }
  return <><Link href="/customers" className="back-link">← Back to customers</Link><div className="page-heading"><div><p className="eyebrow">CUSTOMER MANAGEMENT</p><h1>Add a customer</h1><p className="subheading">Add a new customer to your workspace.</p></div></div><div className="new-customer-layout"><div className="detail-card"><h2>Customer details</h2><p className="card-intro">Fill in the information below. All fields are required.</p><CreateCustomerForm /></div><aside className="tip-card"><span>✦</span><h3>Quick tip</h3><p>New customers are added with pending status. You can activate them from their profile once you&apos;re ready.</p></aside></div></>;
}
