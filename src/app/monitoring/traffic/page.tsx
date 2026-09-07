import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { TrafficClient } from "./traffic-client";
export const dynamic = "force-dynamic";
export default function TrafficPage() {
  return (<AuthenticatedLayout><TrafficClient /></AuthenticatedLayout>);
}
