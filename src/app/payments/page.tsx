import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { PaymentsClient } from "./payments-client";
export const dynamic = "force-dynamic";
export default function PaymentsPage() {
  return (<AuthenticatedLayout><PaymentsClient /></AuthenticatedLayout>);
}
