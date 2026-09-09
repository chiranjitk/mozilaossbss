import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { MikrotikDevicesClient } from "./mikrotik-client";

export const dynamic = "force-dynamic";

export default function MikrotikDevicesPage() {
  return (
    <AuthenticatedLayout>
      <MikrotikDevicesClient />
    </AuthenticatedLayout>
  );
}
