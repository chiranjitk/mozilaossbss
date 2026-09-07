import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { ActiveSessionsClient } from "./sessions-client";

export const dynamic = "force-dynamic";

export default function ActiveSessionsPage() {
  return (
    <AuthenticatedLayout>
      <ActiveSessionsClient />
    </AuthenticatedLayout>
  );
}
