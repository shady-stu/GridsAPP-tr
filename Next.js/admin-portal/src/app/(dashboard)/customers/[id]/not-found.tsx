import Link from "next/link";
export default function NotFound() { return <div className="empty-state not-found"><span>⌕</span><h1>Customer not found</h1><p>This customer doesn&apos;t exist or is outside your workspace.</p><Link href="/customers" className="button button-secondary">Back to customers</Link></div>; }
