import type { Metadata } from "next";
import { PolicyPage } from "@/components/site/PolicyPage";
import { getPolicy } from "@/server/data/pages";

export const metadata: Metadata = { title: "Refund Policy" };

/** Text is edited by owners/admins in the dashboard (Policies). */
export default async function Page() {
  return <PolicyPage policy={await getPolicy("refunds")} />;
}
