import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { SubnetsClient } from "./subnets-client";

export const dynamic = "force-dynamic";

export default function SubnetsPage() {
  return (
    <AuthenticatedLayout>
      <SubnetsClient />
    </AuthenticatedLayout>
  );
}
