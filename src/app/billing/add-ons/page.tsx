import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { AddOnsClient } from "./add-ons-client";

export const dynamic = "force-dynamic";

export default function AddOnsPage() {
  return (
    <AuthenticatedLayout>
      <AddOnsClient />
    </AuthenticatedLayout>
  );
}
