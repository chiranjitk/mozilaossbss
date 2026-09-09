import { requireAuthOrRedirect } from "@/core/rbac";
import { EnginesControlCenter } from "./engines-client";

export const dynamic = "force-dynamic";

export default async function EnginesPage() {
  await requireAuthOrRedirect();
  return <EnginesControlCenter />;
}
