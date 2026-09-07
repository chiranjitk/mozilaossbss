import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { NasClient } from "./nas-client";

export const dynamic = "force-dynamic";

export default function NasPage() {
  return (
    <AuthenticatedLayout>
      <NasClient />
    </AuthenticatedLayout>
  );
}
