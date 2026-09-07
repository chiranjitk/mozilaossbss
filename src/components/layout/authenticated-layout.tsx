// =====================================================================
// AUTHENTICATED LAYOUT — shared server wrapper for all app pages
// Fetches session + navigation, renders AppShell.
// Every authenticated page wraps its children with this.
// =====================================================================

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/core/auth/nextauth";
import { buildNavigation } from "@/core/modules/resolver";
import { AppShell } from "@/components/layout/app-shell";

export const dynamic = "force-dynamic";

export async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }
  const navigation = await buildNavigation(session.user.tenantId);

  return <AppShell navigation={navigation}>{children}</AppShell>;
}
