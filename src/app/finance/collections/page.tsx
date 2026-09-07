import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { CollectionsClient } from "./collections-client";
export const dynamic = "force-dynamic";
export default function CollectionsPage() {
  return (<AuthenticatedLayout><CollectionsClient /></AuthenticatedLayout>);
}
