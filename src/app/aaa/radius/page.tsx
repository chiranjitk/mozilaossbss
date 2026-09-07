import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { RadiusConfigClient } from "./radius-config-client";

export const dynamic = "force-dynamic";

export default function RadiusConfigPage() {
  return (
    <AuthenticatedLayout>
      <RadiusConfigClient />
    </AuthenticatedLayout>
  );
}
