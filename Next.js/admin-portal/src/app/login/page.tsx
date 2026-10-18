import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { LoginForm } from "@/components/login-form";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Sign in | Grids Portal", description: "Sign in to the Grids demo customer portal." };
export const instant = false;

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return <main className="login-page"><Suspense fallback={<div className="loading-state">Loading sign-in…</div>}><LoginContent searchParams={searchParams} /></Suspense></main>;
}

async function LoginContent({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams;
  if (await getCurrentUser()) redirect("/dashboard");
  return <section className="login-card"><Link className="brand login-brand" href="/"><span className="brand-mark">G</span><span>grids<span className="brand-light"> / portal</span></span></Link><p className="eyebrow">DEMO WORKSPACE</p><h1>Welcome back</h1><p className="subheading">Sign in to manage your customer workspace.</p><LoginForm error={params.error} /><aside className="demo-hint"><strong>Demo accounts</strong><span>Admin: admin@northstar.example · code: admin-demo</span><span>Viewer: viewer@northstar.example · code: viewer-demo</span></aside><p className="login-disclaimer">Demo authentication only. Do not use these credentials for real data.</p></section>;
}
