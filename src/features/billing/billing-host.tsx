import "server-only";
import { getServiceClient, type ServiceClient } from "@/lib/supabase/service";
import { billingBanner } from "./banners";
import { loadBilling } from "./billing-store";
import { BillingPopups, type OutOfReplies, type ReplyUsage } from "./billing-popups";
import type { OfferOrg } from "./offer-dialogs";
import { foundingSpotsLeftCached } from "./founding";
import { checkoutTrialDays } from "./plans";
import { perDayFromWeek, type ReplyPain } from "./reply-pain";
import { getStripe } from "./stripe-client";
import { loadPlans, loadReplyLimit, orgPlanId, planLimitsOn } from "./usage";

// The plan banner and pop-ups for a layout (Walter's flow, 20 Nov). Mounted by the dashboard
// layout (banner on every page) and the setup layout (pop-ups only), so any link to
// `?upgrade=<reason>` opens the upgrade offer over that page and `/inbox?welcome=1` the welcome.

const day = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
const shortDay = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** The open brand's customer messages a day (last 7 days) and how many need the owner now. */
async function loadReplyPain(
  db: ServiceClient,
  tenantId: string,
  needsYouStatuses: readonly string[],
  now: Date,
): Promise<ReplyPain> {
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const [week, waiting] = await Promise.all([
    db
      .from("inbound_items")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("received_at", since),
    db
      .from("inbound_items")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .in("status", [...needsYouStatuses]),
  ]);
  return { perDay: perDayFromWeek(week.count ?? 0), waiting: waiting.count ?? 0 };
}

async function loadHostProps(input: {
  orgId: string;
  isOwner: boolean;
  canInvite: boolean;
  tenantId: string | null;
  needsYouStatuses: readonly string[];
}): Promise<{
  org: OfferOrg;
  banner: "out" | "nudge" | null;
  out: OutOfReplies | null;
  usage: ReplyUsage | null;
}> {
  const { orgId, isOwner, canInvite, tenantId, needsYouStatuses } = input;
  const db = getServiceClient();
  const now = new Date();
  const [bill, plans, limitsOn] = await Promise.all([
    loadBilling(db, orgId),
    loadPlans(db),
    planLimitsOn(db),
  ]);
  // Founding, as Your plan and checkout decide it: the first paid plan, while Stripe has spots
  // (cached for a few minutes: this runs on every dashboard and setup page).
  const trial = checkoutTrialDays(bill) !== null;
  const stripe = getStripe();
  const founding = trial && !!stripe && (await foundingSpotsLeftCached(stripe));
  const status = limitsOn ? await loadReplyLimit(db, orgId, now) : null;
  const banner = billingBanner({
    limitsOn,
    plan: status?.plan.plan ?? null,
    level: status?.limit.level ?? null,
  });
  const out: OutOfReplies | null =
    banner === "out" && status
      ? {
          resetsOn: day(status.limit.resetsAt),
          resetsKey: status.limit.resetsAt.toISOString().slice(0, 10),
          pain: tenantId
            ? await loadReplyPain(db, tenantId, needsYouStatuses, now)
            : { perDay: 0, waiting: 0 },
        }
      : null;
  const usage: ReplyUsage | null = status
    ? {
        used: status.limit.used,
        allowance: status.limit.allowance,
        resetsOn: shortDay(status.limit.resetsAt),
        reached: status.limit.level === "reached",
      }
    : null;
  return {
    banner,
    out,
    usage,
    org: {
      orgId,
      isOwner,
      canInvite,
      current: orgPlanId(bill),
      plans,
      trial,
      founding,
      stripeReady: !!stripe,
      interval: bill?.billing_interval === "year" ? "year" : "month",
    },
  };
}

export async function BillingHost({
  orgId,
  isOwner,
  canInvite,
  tenantId = null,
  needsYouStatuses = [],
  connect,
  showBanner = true,
}: {
  orgId: string;
  /** Manages the bill (billing.view). */
  isOwner: boolean;
  /** Can invite people (team.manage). */
  canInvite: boolean;
  /** The open brand, for the out-of-replies numbers (none in setup). */
  tenantId?: string | null;
  /** The Inbox's "need you" statuses (the badge). */
  needsYouStatuses?: readonly string[];
  /** Connect an account (accounts' server action): after paying, the tapped connect carries on. */
  connect?: (formData: FormData) => Promise<void>;
  showBanner?: boolean;
}) {
  const props = await loadHostProps({
    orgId,
    isOwner,
    canInvite,
    tenantId,
    needsYouStatuses,
  }).catch((e: unknown) => {
    // Never blocks the page: no banner or pop-up this time.
    console.error("billing: plan banner failed", {
      orgId,
      error: e instanceof Error ? e.message : "unknown",
    });
    return null;
  });
  if (!props) return null;
  return (
    <BillingPopups
      {...props}
      tenantId={tenantId}
      needsYou={needsYouStatuses}
      connect={connect}
      showBanner={showBanner}
    />
  );
}
