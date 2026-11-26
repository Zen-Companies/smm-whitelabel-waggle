import "server-only";
import { getServiceClient } from "@/lib/supabase/service";
import { loadBilling } from "./billing-store";
import { InboxCountdownLine } from "./inbox-countdown-line";
import { loadOpenDms } from "./open-dms";
import { checkoutTrialDays } from "./plans";
import { upgradeHref } from "./upgrade";
import { loadPlans, orgPlanId } from "./usage";

/**
 * The open brand's DM countdown above the Inbox list (Playbook round 2, 26 Nov). Free owners get
 * the Try Solo pop-up from it; paid plans and teammates see just the clock. Never blocks the
 * Inbox: anything that fails shows nothing.
 */
export async function InboxCountdown({
  orgId,
  tenantId,
  canUpgrade,
  needsYou,
}: {
  orgId: string;
  tenantId: string;
  /** Manages the bill (billing.view). */
  canUpgrade: boolean;
  /** The Inbox's "need you" statuses. */
  needsYou: readonly string[];
}) {
  const db = getServiceClient();
  const now = new Date();
  const loaded = await Promise.all([
    loadOpenDms(db, tenantId, needsYou, now),
    loadBilling(db, orgId),
    loadPlans(db),
  ]).catch((e: unknown) => {
    console.error("billing: inbox countdown failed", {
      tenantId,
      error: e instanceof Error ? e.message : "unknown",
    });
    return null;
  });
  if (!loaded) return null;
  const [dms, bill, plans] = loaded;
  if (dms.length === 0) return null;
  const free = orgPlanId(bill) === "free";
  const solo = plans.solo;
  const offer =
    free && canUpgrade
      ? {
          href: upgradeHref("nudge", "/inbox"),
          label: checkoutTrialDays(bill) !== null ? `Try ${solo.name} free` : `See ${solo.name}`,
        }
      : null;
  return <InboxCountdownLine dms={dms} offer={offer} />;
}
