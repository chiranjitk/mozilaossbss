import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { UsersClient } from "./users-client";

export const dynamic = "force-dynamic";

export default function UsersPage() {
  return (
    <AuthenticatedLayout>
      <UsersClient />
    </AuthenticatedLayout>
  );
}
