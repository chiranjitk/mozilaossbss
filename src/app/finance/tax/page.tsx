import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { TaxClient } from "./tax-client";
export const dynamic = "force-dynamic";
export default function TaxPage() {
  return (<AuthenticatedLayout><TaxClient /></AuthenticatedLayout>);
}
