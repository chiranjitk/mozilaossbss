import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { AlertsClient } from "./alerts-client";
export const dynamic = "force-dynamic";
export default function AlertsPage() {
  return (<AuthenticatedLayout><AlertsClient /></AuthenticatedLayout>);
}
