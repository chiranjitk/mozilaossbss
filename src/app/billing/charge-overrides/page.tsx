import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { ChargeOverridesClient } from "./charge-overrides-client";

export const dynamic = "force-dynamic";

export default function ChargeOverridesPage() {
  return (
    <AuthenticatedLayout>
      <ChargeOverridesClient />
    </AuthenticatedLayout>
  );
}
