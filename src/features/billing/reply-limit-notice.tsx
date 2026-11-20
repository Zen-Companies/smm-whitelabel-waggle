import Link from "next/link";
import { CombMeter } from "@/components/app/bee-plan";
import { getServiceClient } from "@/lib/supabase/service";
import { replyLimitNote } from "./reply-limit";
import { upgradeHref, upgradeLabel } from "./upgrade";
import { loadReplyLimit, planLimitsOn } from "./usage";

/**
 * Replies running low (Pricing Bible; canvas "Settings · Your plan, with the bee"): the 80% note
 * on Today. Out of replies is the banner on every page and its pop-up once a session (Walter's
 * flow, 20 Nov; BillingHost), so it isn't repeated here. Nothing while plan limits are off or
 * there's no plan.
 */
export async function ReplyLimitNotice({
  orgId,
  where,
}: {
  orgId: string;
  isOwner: boolean;
  where: "today" | "inbox";
}) {
  if (where !== "today") return null;
  const db = getServiceClient();
  if (!(await planLimitsOn(db))) return null;
  const status = await loadReplyLimit(db, orgId, new Date());
  if (!status || status.limit.level !== "warn") return null;
  const { limit, plan } = status;
  const note = replyLimitNote(limit, plan.plan);
  if (!note) return null;
  const free = plan.plan === "free";
  return (
    <section
      role="status"
      className="border-honey-border bg-honey-tint flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3"
    >
      <span className="flex min-w-[200px] flex-1 flex-wrap items-center gap-3">
        <CombMeter used={limit.used} allowance={limit.allowance} size={11} />
        <span className="min-w-[200px] flex-1 text-sm">
          <b>{note.title}</b> {note.body}
        </span>
      </span>
      <Link
        href={free ? upgradeHref("replies", "/today") : upgradeHref("top_up", "/today")}
        className="action-link text-sm"
      >
        {free ? upgradeLabel("replies") : "Get more replies"}
      </Link>
    </section>
  );
}
