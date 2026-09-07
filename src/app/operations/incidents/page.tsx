import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { IncidentsClient } from "./incidents-client";
export const dynamic = "force-dynamic";
export default function IncidentsPage() {
  return (<AuthenticatedLayout><IncidentsClient /></AuthenticatedLayout>);
}
