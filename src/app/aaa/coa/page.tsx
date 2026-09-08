import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { CoaClient } from "./coa-client";

export const dynamic = "force-dynamic";

export default function CoaEventsPage() {
  return (
    <AuthenticatedLayout>
      <CoaClient />
    </AuthenticatedLayout>
  );
}
