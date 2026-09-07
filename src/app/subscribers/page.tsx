import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { SubscribersClient } from "./subscribers-client";

export const dynamic = "force-dynamic";

export default function SubscribersPage() {
  return (
    <AuthenticatedLayout>
      <SubscribersClient />
    </AuthenticatedLayout>
  );
}
