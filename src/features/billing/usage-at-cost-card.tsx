import * as Sentry from "@sentry/nextjs";
import { getSocialProvider } from "@/lib/social";
import { getServiceClient } from "@/lib/supabase/service";
import { TRIAL } from "./plans";
import { usageParts, usageWindow, usd, type UsagePart } from "./usage-at-cost";
import type { BillingRecord } from "./billing-store";

/** The start of the cycle Stripe is in now: the trial's first day, else a month or year back. */
function cycleStart(bill: BillingRecord): Date | null {
  if (bill.status === "trialing" && bill.trial_ends_at) {
    return new Date(new Date(bill.trial_ends_at).getTime() - TRIAL.days * 24 * 60 * 60_000);
  }
  if (!bill.current_period_end) return null;
  const d = new Date(bill.current_period_end);
  if (bill.billing_interval === "year") d.setUTCFullYear(d.getUTCFullYear() - 1);
  else d.setUTCMonth(d.getUTCMonth() - 1);
  return d;
}

/**
 * Your plan → Usage at cost (design "Every Zernio platform", approved 18 Nov): this cycle's
 * pay-per-use per business, charged with the plan at cost, no markup. Read from Zernio's usage
 * report on each visit; shown only when there's something to show.
 */
export async function UsageAtCostCard({ orgId, bill }: { orgId: string; bill: BillingRecord }) {
  const start = cycleStart(bill);
  if (!start) return null;
  const now = new Date();
  const db = getServiceClient();
  const { data: tenants } = await db
    .from("tenants")
    .select("id, name, zernio_profile_id")
    .eq("organization_id", orgId)
    .not("zernio_profile_id", "is", null);
  const rows: { name: string; parts: UsagePart[]; cents: number }[] = [];
  let unavailable = false;
  for (const t of tenants ?? []) {
    try {
      const totals = await getSocialProvider().getUsageCost({
        profileId: t.zernio_profile_id!,
        ...usageWindow(start, new Date(now.getTime() + 1)),
        signal: AbortSignal.timeout(10_000),
      });
      const u = usageParts(totals);
      if (u.cents > 0) rows.push({ name: t.name, ...u });
    } catch (error) {
      unavailable = true;
      Sentry.captureException(error, { extra: { organizationId: orgId, step: "usage-card" } });
    }
  }
  if (!rows.length && !unavailable) return null;
  const total = rows.reduce((n, r) => n + r.cents, 0);
  const due = bill.status === "trialing" ? bill.trial_ends_at : bill.current_period_end;
  const dueText = due
    ? new Date(due).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
    : null;
  return (
    <section className="card flex flex-col gap-3 p-5" aria-labelledby="usage-at-cost">
      <h3 id="usage-at-cost" className="text-base font-semibold">
        Usage at cost
      </h3>
      {rows.length > 0 && (
        <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1.5 text-sm tabular-nums">
          {rows.flatMap((r) =>
            r.parts.map((p) => (
              <div key={`${r.name}-${p.label}`} className="contents">
                <dt>
                  {p.label}, {r.name}
                </dt>
                <dd>{usd(p.cents)}</dd>
              </div>
            )),
          )}
          <div className="border-line contents font-semibold">
            <dt className="border-line border-t pt-1.5">
              This billing cycle so far{dueText ? `, charged ${dueText} with your plan` : ""}
            </dt>
            <dd className="border-line border-t pt-1.5">{usd(total)}</dd>
          </div>
        </dl>
      )}
      {unavailable && (
        <p className="text-ink-2 text-sm">
          Part of this cycle&apos;s usage couldn&apos;t be loaded right now.
        </p>
      )}
      <p className="meta">
        Pay-per-use (like X and texts) at what our providers charge us, with no markup.
      </p>
    </section>
  );
}
