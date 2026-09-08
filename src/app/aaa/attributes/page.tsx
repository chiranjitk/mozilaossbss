import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { AttributesClient } from "./attributes-client";

export const dynamic = "force-dynamic";

export default function RadiusAttributesPage() {
  return (
    <AuthenticatedLayout>
      <AttributesClient />
    </AuthenticatedLayout>
  );
}
