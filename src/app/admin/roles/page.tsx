import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { RolesClient } from "./roles-client";

export const dynamic = "force-dynamic";

export default function RolesPage() {
  return (
    <AuthenticatedLayout>
      <RolesClient />
    </AuthenticatedLayout>
  );
}
