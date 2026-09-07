import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { BandwidthClient } from "./bandwidth-client";
export const dynamic = "force-dynamic";
export default function BandwidthPage() {
  return (<AuthenticatedLayout><BandwidthClient /></AuthenticatedLayout>);
}
