import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { CreditNotesClient } from "./credit-notes-client";

export const dynamic = "force-dynamic";

export default function CreditNotesPage() {
  return (
    <AuthenticatedLayout>
      <CreditNotesClient />
    </AuthenticatedLayout>
  );
}
