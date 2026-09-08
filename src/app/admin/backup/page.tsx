import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { BackupClient } from "./backup-client";

export const dynamic = "force-dynamic";

export default function BackupPage() {
  return (
    <AuthenticatedLayout>
      <BackupClient />
    </AuthenticatedLayout>
  );
}
