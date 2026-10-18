"use client";
export default function CustomersError({ reset }: { error: Error & { digest?: string }; reset: () => void }) { return <div className="empty-state"><h1>Something went wrong</h1><p>We couldn&apos;t load customer information. Please try again.</p><button className="button button-secondary" onClick={reset}>Try again</button></div>; }
