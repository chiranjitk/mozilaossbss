// =====================================================================
// MODULE MANAGER PAGE — list/enable/disable modules with full detail
// Server component: auth + nav. Client component: interactive UI.
// =====================================================================

import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { ModuleManagerClient } from "./module-manager-client";

export const dynamic = "force-dynamic";

export default function ModuleManagerPage() {
  return (
    <AuthenticatedLayout>
      <ModuleManagerClient />
    </AuthenticatedLayout>
  );
}
