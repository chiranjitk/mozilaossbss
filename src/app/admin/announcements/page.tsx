import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { AnnouncementsClient } from "./announcements-client";

export const dynamic = "force-dynamic";

export default function AnnouncementsPage() {
  return (
    <AuthenticatedLayout>
      <AnnouncementsClient />
    </AuthenticatedLayout>
  );
}
