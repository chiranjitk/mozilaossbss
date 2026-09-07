import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { RevenueClient } from "./revenue-client";
export const dynamic = "force-dynamic";
export default function RevenuePage() {
  return (<AuthenticatedLayout><RevenueClient /></AuthenticatedLayout>);
}
