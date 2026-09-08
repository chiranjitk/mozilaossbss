import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { DiagnosisClient } from "./diagnosis-client";
export const dynamic = "force-dynamic";
export default function DiagnosisPage() {
  return (<AuthenticatedLayout><DiagnosisClient /></AuthenticatedLayout>);
}
