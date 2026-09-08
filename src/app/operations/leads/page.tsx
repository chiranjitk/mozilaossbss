import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { LeadsClient } from "./leads-client";

export const dynamic = "force-dynamic";

export default function LeadsPage() {
  return (
    <AuthenticatedLayout>
      <LeadsClient />
    </AuthenticatedLayout>
  );
}
