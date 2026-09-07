import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { VouchersClient } from "./vouchers-client";

export const dynamic = "force-dynamic";

export default function VouchersPage() {
  return (
    <AuthenticatedLayout>
      <VouchersClient />
    </AuthenticatedLayout>
  );
}
