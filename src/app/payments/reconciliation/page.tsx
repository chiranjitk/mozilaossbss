import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { ReconciliationClient } from "./reconciliation-client";
export const dynamic = "force-dynamic";
export default function ReconciliationPage() {
  return (<AuthenticatedLayout><ReconciliationClient /></AuthenticatedLayout>);
}
