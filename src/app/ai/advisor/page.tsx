import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { AdvisorClient } from "./advisor-client";
export const dynamic = "force-dynamic";
export default function AdvisorPage() {
  return (<AuthenticatedLayout><AdvisorClient /></AuthenticatedLayout>);
}
