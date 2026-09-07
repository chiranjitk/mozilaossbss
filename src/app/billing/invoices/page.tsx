import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { InvoicesClient } from "./invoices-client";

export const dynamic = "force-dynamic";

export default function InvoicesPage() {
  return (
    <AuthenticatedLayout>
      <InvoicesClient />
    </AuthenticatedLayout>
  );
}
