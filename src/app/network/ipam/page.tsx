import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { IpamClient } from "./ipam-client";

export const dynamic = "force-dynamic";

export default function IpamPage() {
  return (
    <AuthenticatedLayout>
      <IpamClient />
    </AuthenticatedLayout>
  );
}
