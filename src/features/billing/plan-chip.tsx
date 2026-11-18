import { cache } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { StateMark } from "@/components/app/state-mark";
import { getServiceClient } from "@/lib/supabase/service";
import { cn } from "cn";
import { loadBilling } from "./billing-store";
import { isPlanId } from "./plans";
import { planChipState, planChipText, showOnPhone, type PlanChipState } from "./plan-chip-state";
import { getStripe } from "./stripe-client";
import { planIsLive } from "./subscription";
import { loadPlans, loadReplyLimit } from "./usage";

// Your plan next to your profile (design "Your plan next to your profile, and connecting in a
// new tab", approved 18 Nov): a chip left of the account button, Your plan on top of the account
// menu, and the first row under More on a phone. Everything comes from what Your plan knows.

export const PLAN_HREF = "/plan";

/** Once per request: the header, the menu and More share it. */
const loadChip = cache(
  async (orgId: string): Promise<{ state: PlanChipState | null; renews: string | null }> => {
    const db = getServiceClient();
    const now = new Date();
    const [bill, plans] = await Promise.all([loadBilling(db, orgId), loadPlans(db)]);
    const live = !!bill && planIsLive(bill.status) && isPlanId(bill.plan);
    const replies = live ? await loadReplyLimit(db, orgId, now) : null;
    const state = planChipState({
      status: bill?.status ?? null,
      planName: live && isPlanId(bill!.plan) ? plans[bill!.plan].name : null,
      trialEndsAt: bill?.trial_ends_at ?? null,
      replies: replies ? { used: replies.limit.used, allowance: replies.limit.allowance } : null,
      now,
      stripeOn: !!getStripe(),
    });
    const renews =
      live && bill?.current_period_end && bill.status === "active"
        ? new Date(bill.current_period_end).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          })
        : null;
    return { state, renews };
  },
);

/** Five small cells, filled by replies used. */
function MiniComb({ used, allowance }: { used: number; allowance: number }) {
  const filled = allowance > 0 ? Math.min(5, Math.round((used / allowance) * 5)) : 0;
  return (
    <span aria-hidden className="inline-flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <span
          key={i}
          className={cn("h-2.5 w-[9px]", i < filled ? "bg-honey" : "bg-line")}
          style={{ clipPath: "polygon(50% 0,100% 25%,100% 75%,50% 100%,0 75%,0 25%)" }}
        />
      ))}
    </span>
  );
}

const TONE: Record<PlanChipState["kind"], string> = {
  trial: "border-honey-border bg-honey-tint text-ink",
  plan: "border-line bg-surface text-ink",
  reached: "border-honey bg-honey text-[#17140F]",
  choose: "border-honey bg-honey text-[#17140F]",
  past_due: "border-danger/40 bg-surface text-danger",
};

function Mark({ state }: { state: PlanChipState }) {
  if (state.kind === "trial") return <StateMark state="waiting" />;
  if (state.kind === "past_due") return <StateMark state="needs" />;
  if (state.kind === "plan") return <MiniComb used={state.used} allowance={state.allowance} />;
  return null;
}

/** The header chip. Owners only: they pay. On a phone only when there's something to do. */
export type PlanViewer = { orgId: string; isOwner: boolean };

export async function PlanChip({ orgId, isOwner }: PlanViewer) {
  const { state } = await loadChip(orgId);
  if (!state || !isOwner) return null;
  return (
    <Link
      href={PLAN_HREF}
      aria-label={`Your plan: ${planChipText(state)}`}
      className={cn(
        "min-h-9 items-center gap-2 rounded-full border px-3 text-[13px] font-semibold whitespace-nowrap transition-colors duration-150 hover:opacity-90",
        showOnPhone(state) ? "inline-flex" : "hidden md:inline-flex",
        TONE[state.kind],
      )}
    >
      <Mark state={state} />
      <span className="md:hidden">{planChipText(state, true)}</span>
      <span className="hidden md:inline">{planChipText(state)}</span>
      {state.kind === "plan" && (
        <span className="text-ink-3 hidden font-medium lg:inline">
          {state.used} of {state.allowance} replies
        </span>
      )}
    </Link>
  );
}

function summary(state: PlanChipState, renews: string | null): { title: string; line: string } {
  switch (state.kind) {
    case "trial":
      return { title: `${state.planName} · free trial`, line: planChipText(state, true) };
    case "plan":
      return {
        title: renews ? `${state.planName} · renews ${renews}` : state.planName,
        line: `${state.used} of ${state.allowance} replies this month`,
      };
    case "reached":
      return { title: "Replies used up", line: "Add 200 for $15, or wait for next month" };
    case "past_due":
      return { title: "Card declined", line: "Update your card so Waggle keeps writing" };
    case "choose":
      return { title: "No plan yet", line: "Choose a plan to keep Waggle writing" };
  }
}

/** Top of the account menu: everyone sees the plan; only owners get the way in. */
export async function PlanMenuRow({ orgId, isOwner }: PlanViewer) {
  const { state, renews } = await loadChip(orgId);
  if (!state) return null;
  const { title, line } = summary(state, renews);
  const body = (
    <>
      <span className="text-ink-3 text-xs">Your plan</span>
      <b className="text-sm font-semibold">{title}</b>
      <span className="text-ink-2 flex items-center gap-2 text-[13px]">
        {state.kind === "plan" && <MiniComb used={state.used} allowance={state.allowance} />}
        {line}
      </span>
      {isOwner && (
        <span className="text-honey-text text-[13px] font-semibold">Open Your plan →</span>
      )}
    </>
  );
  return isOwner ? (
    <Link
      href={PLAN_HREF}
      className="bg-honey-tint hover:bg-honey-tint/70 mb-1 flex flex-col gap-1 rounded-[12px] p-3 no-underline"
    >
      {body}
    </Link>
  ) : (
    <div className="bg-subtle mb-1 flex flex-col gap-1 rounded-[12px] p-3">{body}</div>
  );
}

/** First row under More on a phone. */
export async function PlanMoreRow({ orgId, isOwner }: PlanViewer) {
  const { state, renews } = await loadChip(orgId);
  if (!state) return null;
  const { title, line } = summary(state, renews);
  const inner = (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-ink-3 text-xs">Your plan</span>
        <b className="font-semibold">{title}</b>
        <span className="text-ink-2 flex items-center gap-2 text-[13px]">
          {state.kind === "plan" && <MiniComb used={state.used} allowance={state.allowance} />}
          {line}
        </span>
      </span>
      {isOwner && <ChevronRight className="text-ink-3 size-4" aria-hidden />}
    </>
  );
  return isOwner ? (
    <Link
      href={PLAN_HREF}
      className="border-honey-border bg-honey-tint flex min-h-14 items-center gap-3 rounded-2xl border p-4"
    >
      {inner}
    </Link>
  ) : (
    <div className="border-line bg-surface flex items-center gap-3 rounded-2xl border p-4">
      {inner}
    </div>
  );
}
