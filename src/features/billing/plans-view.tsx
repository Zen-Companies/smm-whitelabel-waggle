import { notFound } from "next/navigation";
import { hasPermission } from "@/features/staff";
import { getServiceClient } from "@/lib/supabase/service";
import { PlanSettingsForm } from "./plans-form";
import { loadPlans } from "./usage";

/**
 * Staff → Plans (canvas "Staff pages, cleaned up", approved 20 Nov): what each plan includes,
 * changeable without a release. Prices are set in Stripe.
 */
export async function PlansView() {
  if (!(await hasPermission("admin.caps.manage"))) notFound();
  const db = getServiceClient();
  const [plans, { data: rows }] = await Promise.all([
    loadPlans(db),
    db
      .from("plan_settings")
      .select("updated_at, updated_by")
      .order("updated_at", { ascending: false })
      .limit(1),
  ]);
  const last = rows?.[0];
  let lastChanged: string | null = null;
  if (last?.updated_at) {
    const when = new Date(last.updated_at).toLocaleString("en-US", {
      day: "numeric",
      month: "short",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    });
    const who = last.updated_by
      ? (await db.auth.admin.getUserById(last.updated_by)).data.user?.email
      : null;
    lastChanged = `${when} UTC${who ? ` by ${who}` : ""}`;
  }
  return <PlanSettingsForm plans={plans} lastChanged={lastChanged} />;
}
