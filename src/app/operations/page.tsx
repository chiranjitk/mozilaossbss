import { redirect } from "next/navigation";

// Module index — redirect to the default child view.
export default function OperationsIndexPage() {
  redirect("/operations/complaints");
}
