import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { ChurnClient } from "./churn-client";
export const dynamic = "force-dynamic";
export default function ChurnPage() {
  return (<AuthenticatedLayout><ChurnClient /></AuthenticatedLayout>);
}
