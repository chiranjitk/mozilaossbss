import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { AgentsClient } from "./agents-client";

export const dynamic = "force-dynamic";

export default function AgentsPage() {
  return (
    <AuthenticatedLayout>
      <AgentsClient />
    </AuthenticatedLayout>
  );
}
