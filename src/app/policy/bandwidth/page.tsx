import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { BandwidthProfilesClient } from "./bandwidth-client";
export const dynamic = "force-dynamic";
export default function BandwidthProfilesPage() {
  return (<AuthenticatedLayout><BandwidthProfilesClient /></AuthenticatedLayout>);
}
