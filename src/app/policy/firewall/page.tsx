import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { FirewallClient } from "./firewall-client";
export const dynamic = "force-dynamic";
export default function FirewallPage() {
  return (<AuthenticatedLayout><FirewallClient /></AuthenticatedLayout>);
}
