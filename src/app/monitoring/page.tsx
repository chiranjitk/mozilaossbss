import { redirect } from "next/navigation";

// Module index — redirect to the default child view.
export default function MonitoringIndexPage() {
  redirect("/monitoring/bandwidth");
}
