import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { SettingsClient } from "./settings-client";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <AuthenticatedLayout>
      <SettingsClient />
    </AuthenticatedLayout>
  );
}
