import { redirect } from "next/navigation";

// Module index — redirect to the default child view.
export default function FinanceIndexPage() {
  redirect("/finance/revenue");
}
