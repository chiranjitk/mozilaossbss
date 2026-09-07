import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { HistoryClient } from "./history-client";

export const dynamic = "force-dynamic";

export default function SessionHistoryPage() {
  return (
    <AuthenticatedLayout>
      <HistoryClient />
    </AuthenticatedLayout>
  );
}
