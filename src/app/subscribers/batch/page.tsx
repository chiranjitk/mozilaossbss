import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { BatchClient } from "./batch-client";

export const dynamic = "force-dynamic";

export default function BatchProvisioningPage() {
  return (
    <AuthenticatedLayout>
      <BatchClient />
    </AuthenticatedLayout>
  );
}
