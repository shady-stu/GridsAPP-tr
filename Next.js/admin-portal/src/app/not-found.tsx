import Link from "next/link";

export default function NotFound() {
  return <main className="not-found empty-state"><span>⌕</span><h1>Page not found</h1><p>The page you&apos;re looking for doesn&apos;t exist.</p><Link href="/dashboard" className="button button-secondary">Go to overview</Link></main>;
}
