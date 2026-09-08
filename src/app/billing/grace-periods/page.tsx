import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { GracePeriodsClient } from "./grace-periods-client";

export const dynamic = "force-dynamic";

export default function GracePeriodsPage() {
  return (
    <AuthenticatedLayout>
      <GracePeriodsClient />
    </AuthenticatedLayout>
  );
}
