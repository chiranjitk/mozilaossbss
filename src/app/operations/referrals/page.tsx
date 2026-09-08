import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { ReferralsClient } from "./referrals-client";

export const dynamic = "force-dynamic";

export default function ReferralsPage() {
  return (
    <AuthenticatedLayout>
      <ReferralsClient />
    </AuthenticatedLayout>
  );
}
