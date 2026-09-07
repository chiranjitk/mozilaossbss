import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { ComplaintsClient } from "./complaints-client";

export const dynamic = "force-dynamic";

export default function ComplaintsPage() {
  return (
    <AuthenticatedLayout>
      <ComplaintsClient />
    </AuthenticatedLayout>
  );
}
