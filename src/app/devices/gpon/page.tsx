import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { GponClient } from "./gpon-client";

export const dynamic = "force-dynamic";

export default function GponPage() {
  return (
    <AuthenticatedLayout>
      <GponClient />
    </AuthenticatedLayout>
  );
}
