import Link from "next/link";
import { can } from "@/features/orgs";
import { getCurrentTenant } from "@/features/tenants";
import { getServiceClient } from "@/lib/supabase/service";
import { currentStep, SETUP_STEPS, stepsDone } from "./flow";
import { SetupStepper } from "./setup-frame";

/**
 * The 3 setup steps as one line on Today and on top of Teach Waggle until setup is finished
 * (Walter's flow, decision 2): the steps, and Continue back to where the owner left off. Only for
 * people who can set the brand up.
 */
export async function ReadyLine() {
  const tenant = await getCurrentTenant();
  if (!can(tenant.role, "brand.settings")) return null;
  const db = getServiceClient();
  const [{ data: t }, { count }] = await Promise.all([
    db.from("tenants").select("setup_screen, setup_done_at").eq("id", tenant.id).single(),
    db
      .from("social_accounts")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenant.id)
      .eq("status", "active"),
  ]);
  if (!t || t.setup_done_at) return null;
  const done = stepsDone({
    connected: (count ?? 0) > 0,
    saved: t.setup_screen,
    finished: false,
  });
  const step = currentStep(done);
  if (!step) return null;
  return (
    <Link
      href={step === 1 ? "/welcome" : "/setup"}
      aria-label={`Set up Waggle: next, ${SETUP_STEPS[step - 1]}. Continue`}
      className="bg-honey-tint border-honey/40 hover:border-honey flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-3 no-underline transition-colors duration-150"
    >
      <b className="text-ink flex-none font-semibold">Set up Waggle</b>
      <span aria-hidden className="min-w-0">
        <SetupStepper current={step} done={done} />
      </span>
      <span className="flex-1" />
      <span className="action-link with-arrow text-sm">Continue</span>
    </Link>
  );
}
