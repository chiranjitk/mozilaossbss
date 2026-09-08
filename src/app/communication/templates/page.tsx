import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { TemplatesClient } from "./templates-client";
export const dynamic = "force-dynamic";
export default function TemplatesPage() {
  return (<AuthenticatedLayout><TemplatesClient /></AuthenticatedLayout>);
}
