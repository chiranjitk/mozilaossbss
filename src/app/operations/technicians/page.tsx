import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { TechniciansClient } from "./technicians-client";

export const dynamic = "force-dynamic";

export default function TechniciansPage() {
  return (
    <AuthenticatedLayout>
      <TechniciansClient />
    </AuthenticatedLayout>
  );
}
