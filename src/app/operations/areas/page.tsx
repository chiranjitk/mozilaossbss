import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { AreasClient } from "./areas-client";

export const dynamic = "force-dynamic";

export default function AreasPage() {
  return (
    <AuthenticatedLayout>
      <AreasClient />
    </AuthenticatedLayout>
  );
}
