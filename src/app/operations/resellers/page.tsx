import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { ResellersClient } from "./resellers-client";

export const dynamic = "force-dynamic";

export default function ResellersPage() {
  return (
    <AuthenticatedLayout>
      <ResellersClient />
    </AuthenticatedLayout>
  );
}
