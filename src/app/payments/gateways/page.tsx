import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { GatewaysClient } from "./gateways-client";
export const dynamic = "force-dynamic";
export default function GatewaysPage() {
  return (<AuthenticatedLayout><GatewaysClient /></AuthenticatedLayout>);
}
