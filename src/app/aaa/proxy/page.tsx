import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { ProxyClient } from "./proxy-client";

export const dynamic = "force-dynamic";

export default function RadiusProxyPage() {
  return (
    <AuthenticatedLayout>
      <ProxyClient />
    </AuthenticatedLayout>
  );
}
