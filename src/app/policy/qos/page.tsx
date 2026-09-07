import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { QosClient } from "./qos-client";
export const dynamic = "force-dynamic";
export default function QosPage() {
  return (<AuthenticatedLayout><QosClient /></AuthenticatedLayout>);
}
