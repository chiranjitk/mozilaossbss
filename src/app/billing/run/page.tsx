import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { RunBillingClient } from "./run-billing-client";

export const dynamic = "force-dynamic";

export default function RunBillingPage() {
  return (
    <AuthenticatedLayout>
      <RunBillingClient />
    </AuthenticatedLayout>
  );
}
