import { Suspense } from "react";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

// This route only redirects, so there is no page shell for instant-navigation validation.
export const instant = false;

export default function HomePage() {
  return <Suspense fallback={<div className="loading-state">Loading…</div>}><EntryRedirect /></Suspense>;
}

async function EntryRedirect(): Promise<ReactNode> {
  redirect(await getCurrentUser() ? "/dashboard" : "/login");
}
