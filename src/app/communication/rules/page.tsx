import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { RulesClient } from "./rules-client";
export const dynamic = "force-dynamic";
export default function RulesPage() {
  return (<AuthenticatedLayout><RulesClient /></AuthenticatedLayout>);
}
