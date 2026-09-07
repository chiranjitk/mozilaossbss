import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { InventoryClient } from "./inventory-client";
export const dynamic = "force-dynamic";
export default function InventoryPage() {
  return (<AuthenticatedLayout><InventoryClient /></AuthenticatedLayout>);
}
