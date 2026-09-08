import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { TopUpsClient } from "./top-ups-client";

export const dynamic = "force-dynamic";

export default function TopUpsPage() {
  return (
    <AuthenticatedLayout>
      <TopUpsClient />
    </AuthenticatedLayout>
  );
}
