import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { InterfacesClient } from "./interfaces-client";

export const dynamic = "force-dynamic";

export default function InterfacesPage() {
  return (
    <AuthenticatedLayout>
      <InterfacesClient />
    </AuthenticatedLayout>
  );
}
