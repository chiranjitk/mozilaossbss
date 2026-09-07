import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { PlansClient } from "./plans-client";

export const dynamic = "force-dynamic";

export default function PlansPage() {
  return (
    <AuthenticatedLayout>
      <PlansClient />
    </AuthenticatedLayout>
  );
}
