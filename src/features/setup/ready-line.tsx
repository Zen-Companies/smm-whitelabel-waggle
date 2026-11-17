import Link from "next/link";
import { StateMark } from "@/components/app/state-mark";
import { can } from "@/features/orgs";
import { getCurrentTenant } from "@/features/tenants";
import { continueHref, nextReadyStep, readyDone } from "./checklist";
import { loadReadySteps } from "./ready-data";

/**
 * "Get Waggle ready" as one line (approved 17 Nov): on top of every Teach Waggle tab and on Today
 * until all five steps are done, then gone. The steps as honeycombs, how many are done, the next
 * one, and Continue back into setup at that step. Only for people who can set the brand up.
 */
export async function ReadyLine() {
  const tenant = await getCurrentTenant();
  if (!can(tenant.role, "brand.settings")) return null;
  const steps = await loadReadySteps(tenant.id);
  const next = nextReadyStep(steps);
  if (!next) return null;
  return (
    <Link
      href={continueHref(steps)}
      aria-label={`Get Waggle ready: ${readyDone(steps)} of ${steps.length} done, next: ${next.label}. Continue`}
      className="bg-honey-tint border-honey/40 hover:border-honey flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-3 no-underline transition-colors duration-150"
    >
      <b className="text-ink flex-none font-semibold">Get Waggle ready</b>
      <span className="flex gap-1" aria-hidden>
        {steps.map((s) => (
          <StateMark key={s.key} state={s.state} size={13} />
        ))}
      </span>
      <span className="text-ink text-sm">
        {readyDone(steps)} of {steps.length} done · next:{" "}
        <b className="font-semibold">{next.label}</b>
      </span>
      <span className="flex-1" />
      <span className="action-link with-arrow text-sm">Continue</span>
    </Link>
  );
}
