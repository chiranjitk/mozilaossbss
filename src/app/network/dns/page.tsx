import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { DnsClient } from "./dns-client";

export const dynamic = "force-dynamic";

export default function DnsPage() {
  return (
    <AuthenticatedLayout>
      <DnsClient />
    </AuthenticatedLayout>
  );
}
