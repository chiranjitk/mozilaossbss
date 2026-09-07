import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { InstallationsClient } from "./installations-client";
export const dynamic = "force-dynamic";
export default function InstallationsPage() {
  return (<AuthenticatedLayout><InstallationsClient /></AuthenticatedLayout>);
}
