import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { RadiusTablesClient } from "./radius-tables-client";

export const dynamic = "force-dynamic";

export default function RadiusTablesPage() {
  return (
    <AuthenticatedLayout>
      <RadiusTablesClient />
    </AuthenticatedLayout>
  );
}
