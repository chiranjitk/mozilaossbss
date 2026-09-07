import { AuthenticatedLayout } from "@/components/layout/authenticated-layout";
import { SyslogClient } from "./syslog-client";
export const dynamic = "force-dynamic";
export default function SyslogPage() {
  return (<AuthenticatedLayout><SyslogClient /></AuthenticatedLayout>);
}
