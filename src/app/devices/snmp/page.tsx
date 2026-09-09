import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { SnmpDevicesClient } from "./snmp-client";

export const dynamic = "force-dynamic";

export default function SnmpDevicesPage() {
  return (
    <AuthenticatedLayout>
      <SnmpDevicesClient />
    </AuthenticatedLayout>
  );
}
