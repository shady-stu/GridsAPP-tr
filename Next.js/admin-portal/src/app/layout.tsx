import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Grids Portal | Customer Workspace",
  description: "A multi-tenant customer administration portal.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return <html lang="en"><body>{children}</body></html>;
}
