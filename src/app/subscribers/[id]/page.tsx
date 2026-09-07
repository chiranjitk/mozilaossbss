import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { Customer360Client } from "./customer-360-client";

export const dynamic = "force-dynamic";

export default async function SubscriberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AuthenticatedLayout>
      <Customer360Client subscriberId={id} />
    </AuthenticatedLayout>
  );
}
