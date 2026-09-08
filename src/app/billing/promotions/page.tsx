import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { PromotionsClient } from "./promotions-client";

export const dynamic = "force-dynamic";

export default function PromotionsPage() {
  return (
    <AuthenticatedLayout>
      <PromotionsClient />
    </AuthenticatedLayout>
  );
}
