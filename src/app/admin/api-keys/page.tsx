import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { ApiKeysClient } from "./api-keys-client";

export const dynamic = "force-dynamic";

export default function ApiKeysPage() {
  return (
    <AuthenticatedLayout>
      <ApiKeysClient />
    </AuthenticatedLayout>
  );
}
