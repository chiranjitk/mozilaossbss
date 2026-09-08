import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { LoyaltyClient } from "./loyalty-client";

export const dynamic = "force-dynamic";

export default function LoyaltyPage() {
  return (
    <AuthenticatedLayout>
      <LoyaltyClient />
    </AuthenticatedLayout>
  );
}
