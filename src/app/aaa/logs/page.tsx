import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { AuthLogsClient } from "./auth-logs-client";

export const dynamic = "force-dynamic";

export default function AuthLogsPage() {
  return (
    <AuthenticatedLayout>
      <AuthLogsClient />
    </AuthenticatedLayout>
  );
}
