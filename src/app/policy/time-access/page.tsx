import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { TimeAccessClient } from "./time-access-client";
export const dynamic = "force-dynamic";
export default function TimeAccessPage() {
  return (<AuthenticatedLayout><TimeAccessClient /></AuthenticatedLayout>);
}
