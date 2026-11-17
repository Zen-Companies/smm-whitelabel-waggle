import Link from "next/link";
import { CombMeter, RestingBee } from "@/components/app/bee-plan";
import { getServiceClient } from "@/lib/supabase/service";
import { buyTopUp, choosePlan } from "./plan-actions";
import { PlanButton } from "./plan-forms";
import { EXTRAS, PLANS } from "./plans";
import { replyLimitNote } from "./reply-limit";
import { loadReplyLimit, planLimitsOn } from "./usage";

/**
 * When replies run low (Pricing Bible; approved 17 Nov, canvas "Settings · Your plan, with the
 * bee" section 3). On Today: the 80% note and the 100% banner. In the Inbox: the 100% banner,
 * where the paused drafts would be. Nothing while plan limits are off or there's no plan.
 */
export async function ReplyLimitNotice({
  orgId,
  isOwner,
  where,
}: {
  orgId: string;
  isOwner: boolean;
  where: "today" | "inbox";
}) {
  const db = getServiceClient();
  if (!(await planLimitsOn(db))) return null;
  const status = await loadReplyLimit(db, orgId, new Date());
  if (!status) return null;
  const { limit, plan } = status;
  if (limit.level === "ok" || (where === "inbox" && limit.level !== "reached")) return null;
  const note = replyLimitNote(limit, plan.plan);
  if (!note) return null;
  const fields = { orgId };

  if (limit.level === "warn") {
    return (
      <section
        role="status"
        className="border-honey-border bg-honey-tint flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3"
      >
        <span className="flex flex-wrap items-center gap-3">
          <CombMeter used={limit.used} allowance={limit.allowance} size={11} />
          <span className="text-sm">
            <b>{note.title}</b> {note.body}
          </span>
        </span>
        <Link href="/settings/billing" className="action-link text-sm">
          See your plan
        </Link>
      </section>
    );
  }

  return (
    <section
      role="status"
      className="border-honey bg-honey-tint flex flex-col gap-2.5 rounded-xl border p-4"
    >
      <div className="flex items-center gap-3">
        <RestingBee />
        <b className="text-[15px]">{note.title}</b>
      </div>
      <span className="text-ink-2 text-sm">{note.body}</span>
      {isOwner ? (
        <div className="flex flex-wrap gap-2">
          <PlanButton
            action={buyTopUp}
            fields={fields}
            label={`+${EXTRAS.topUp.replies} replies for $${EXTRAS.topUp.usd}`}
            honey
            className="items-start"
          />
          {plan.plan === "solo" && (
            <PlanButton
              action={choosePlan}
              fields={{ ...fields, plan: "business", interval: "month" }}
              label={`Upgrade to ${PLANS.business.name}`}
              className="items-start"
            />
          )}
        </div>
      ) : (
        <span className="meta">The Owner can add more replies on Your plan.</span>
      )}
    </section>
  );
}
