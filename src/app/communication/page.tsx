import { redirect } from "next/navigation";

// Module index — redirect to the default child view.
export default function CommunicationIndexPage() {
  redirect("/communication/templates");
}
