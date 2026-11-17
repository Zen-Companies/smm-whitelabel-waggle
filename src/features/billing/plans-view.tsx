import { notFound } from "next/navigation";
import { hasPermission } from "@/features/staff";
import { getServiceClient } from "@/lib/supabase/service";
import { PlanSettingsForm } from "./plans-form";
import { loadPlans } from "./usage";

/**
 * Staff → Plans (design "Billing round 2", approved 18 Nov): what each plan includes, changeable
 * without a release. Prices come from Stripe; the Pricing Bible says what's agreed (only Jason
 * changes a price or a plan).
 */
export async function PlansView() {
  if (!(await hasPermission("admin.caps.manage"))) notFound();
  const db = getServiceClient();
  const [plans, { data: rows }] = await Promise.all([
    loadPlans(db),
    db
      .from("plan_settings")
      .select("updated_at")
      .order("updated_at", { ascending: false })
      .limit(1),
  ]);
  const last = rows?.[0]?.updated_at;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-ink-2 max-w-[760px]">
        What each plan includes. Changes apply right away to every organization on that plan. Prices
        come from Stripe and change there. Blank businesses means unlimited.
      </p>
      <PlanSettingsForm plans={plans} />
      {last && (
        <span className="meta">
          Last changed{" "}
          {new Date(last).toLocaleString("en-US", {
            dateStyle: "medium",
            timeStyle: "short",
            timeZone: "UTC",
          })}{" "}
          UTC.
        </span>
      )}
    </div>
  );
}
