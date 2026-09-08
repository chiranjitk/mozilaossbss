import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { CaptivePortalClient } from "./captive-portal-client";

export const dynamic = "force-dynamic";

export default function CaptivePortalPage() {
  return (
    <AuthenticatedLayout>
      <CaptivePortalClient />
    </AuthenticatedLayout>
  );
}
