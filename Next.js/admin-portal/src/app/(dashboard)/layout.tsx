import { Suspense, type ReactNode } from "react";
import { redirect } from "next/navigation";
import { PortalShell } from "@/components/portal-shell";
import { getCurrentUser } from "@/lib/auth";

export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return <Suspense fallback={<div className="loading-state" role="status"><span className="spinner" />Loading your workspace…</div>}><AuthenticatedPortal>{children}</AuthenticatedPortal></Suspense>;
}

async function AuthenticatedPortal({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return <PortalShell user={user}><Suspense fallback={<div className="loading-state" role="status"><span className="spinner" />Loading workspace data…</div>}>{children}</Suspense></PortalShell>;
}
