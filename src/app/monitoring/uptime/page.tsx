import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { UptimeClient } from "./uptime-client";
export const dynamic = "force-dynamic";
export default function UptimePage() {
  return (<AuthenticatedLayout><UptimeClient /></AuthenticatedLayout>);
}
