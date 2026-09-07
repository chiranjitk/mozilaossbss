import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { AuditClient } from "./audit-client";

export const dynamic = "force-dynamic";

export default function AuditPage() {
  return (
    <AuthenticatedLayout>
      <AuditClient />
    </AuthenticatedLayout>
  );
}
