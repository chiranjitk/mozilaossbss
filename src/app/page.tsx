// =====================================================================
// DASHBOARD PAGE — real KPIs from DB, module-aware widgets
// Server component fetches navigation; client component renders KPIs.
// =====================================================================

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/core/auth/nextauth";
import { buildNavigation } from "@/core/modules/resolver";
import { DashboardClient } from "./dashboard-client";
import { AppShell } from "@/components/layout/app-shell";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect("/login");
  }

  const navigation = await buildNavigation(session.user.tenantId);

  return (
    <AppShell navigation={navigation}>
      <DashboardClient />
    </AppShell>
  );
}
