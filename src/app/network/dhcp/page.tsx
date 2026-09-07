import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { DhcpClient } from "./dhcp-client";

export const dynamic = "force-dynamic";

export default function DhcpPage() {
  return (
    <AuthenticatedLayout>
      <DhcpClient />
    </AuthenticatedLayout>
  );
}
