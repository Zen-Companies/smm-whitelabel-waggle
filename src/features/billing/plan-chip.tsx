import { cache } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { StateMark } from "@/components/app/state-mark";
import { getServiceClient } from "@/lib/supabase/service";
import { cn } from "cn";
import { loadBilling } from "./billing-store";
import { accountAllowance, BUSINESS_CALL_URL, EXTRAS, isPlanId, UNCOUNTED_FILTER } from "./plans";
import { planPeek, type PlanPeek } from "./plan-peek";
import { planChipState, planChipText, showOnPhone, type PlanChipState } from "./plan-chip-state";
import { planIsLive } from "./subscription";
import { UpgradeLink } from "./upgrade-link";
import { loadPlans, loadReplyLimit } from "./usage";

// Your plan next to your profile (design "Your plan next to your profile, and connecting in a
// new tab", approved 18 Nov): a chip left of the account button, Your plan on top of the account
// menu, and the first row under More on a phone. Everything comes from what Your plan knows.

export const PLAN_HREF = "/plan";

/** Once per request: the header, the menu and More share it. */
const loadChip = cache(
  async (
    orgId: string,
  ): Promise<{
    state: PlanChipState | null;
    renews: string | null;
    peek: PlanPeek | null;
    /** Solo's AI replies a month (Staff → Plans), for "Get 300 replies". */
    soloReplies: number;
  }> => {
    const db = getServiceClient();
    const now = new Date();
    const [bill, plans, brandRows] = await Promise.all([
      loadBilling(db, orgId),
      loadPlans(db),
      db.from("tenants").select("id").eq("organization_id", orgId).is("offboarded_at", null),
    ]);
    const live = !!bill && planIsLive(bill.status) && isPlanId(bill.plan);
    // Free counts replies too (19 Nov).
    const replies = await loadReplyLimit(db, orgId, now);
    const state = planChipState({
      status: bill?.status ?? null,
      planName: live && isPlanId(bill!.plan) ? plans[bill!.plan].name : null,
      trialEndsAt: bill?.trial_ends_at ?? null,
      replies: replies ? { used: replies.limit.used, allowance: replies.limit.allowance } : null,
      now,
    });
    const renews =
      live && bill?.current_period_end && bill.status === "active"
        ? shortDay(bill.current_period_end)
        : null;
    const soloReplies = plans.solo.replies;
    if (!state || !replies) return { state, renews, peek: null, soloReplies };

    // The hover card (20 Nov): accounts, businesses and replies on their own, as Your plan says.
    const ids = (brandRows.data ?? []).map((b) => b.id);
    const [accounts, autos] = ids.length
      ? await Promise.all([
          db
            .from("social_accounts")
            .select("id", { count: "exact", head: true })
            .in("tenant_id", ids)
            .eq("status", "active")
            .not("platform", "in", UNCOUNTED_FILTER)
            .then((r) => r.count ?? 0),
          db
            .from("autonomy_settings")
            .select("category")
            .in("tenant_id", ids)
            .eq("mode", "auto")
            .then((r) => (r.data ?? []).map((a) => a.category as string)),
        ])
      : [0, [] as string[]];
    const { plan, limit } = replies;
    const peek = planPeek({
      state,
      planName: plan.details.name,
      planId: plan.plan,
      renews,
      replies: { used: limit.used, allowance: limit.allowance, resets: shortDay(limit.resetsAt) },
      accounts: {
        connected: accounts,
        allowance: accountAllowance(plan.details, plan.extraAccounts),
        paid: plan.plan !== "free",
      },
      brands: { count: ids.length, limit: plan.details.brands },
      autoReplyIncluded: plan.details.features.autoReply,
      autoCategories: autos,
      accountUsd: EXTRAS.accountUsd,
    });
    return { state, renews, peek, soloReplies };
  },
);

const shortDay = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

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
  free: "border-honey-border bg-honey-tint text-ink",
  past_due: "border-danger/40 bg-surface text-danger",
};

function Mark({ state }: { state: PlanChipState }) {
  if (state.kind === "trial") return <StateMark state="waiting" />;
  if (state.kind === "past_due") return <StateMark state="needs" />;
  if (state.kind === "plan" || state.kind === "free")
    return <MiniComb used={state.used} allowance={state.allowance} />;
  return null;
}

/**
 * The header chip. Owners only: they pay. On a phone when there's something to do, or the
 * month's replies compact ("82/100", 26 Nov) where the plan has a reply limit.
 */
export type PlanViewer = { orgId: string; isOwner: boolean };

export async function PlanChip({ orgId, isOwner }: PlanViewer) {
  const { state, peek, soloReplies } = await loadChip(orgId);
  if (!state || !isOwner) return null;
  // On a phone the pill stays 36px tall but taps over 44px (design.md: 44px targets).
  const pillClass = cn(
    "relative min-h-9 items-center gap-2 rounded-full border px-3 text-[13px] font-semibold whitespace-nowrap transition-colors duration-150 before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] hover:opacity-90 md:before:hidden",
    showOnPhone(state) ? "inline-flex" : "hidden md:inline-flex",
    TONE[state.kind],
  );
  const pillLabel = `Your plan: ${planChipText(state)}`;
  const inner = (
    <>
      <Mark state={state} />
      <span className="tabular-nums md:hidden">{planChipText(state, true)}</span>
      <span className="hidden md:inline">{planChipText(state)}</span>
      {state.kind === "plan" && (
        <span className="text-ink-3 hidden font-medium lg:inline">
          {state.used} of {state.allowance} replies
        </span>
      )}
    </>
  );
  // Free and out of replies (Walter's playbook, tap 5): the out-of-replies pop-up opens in place
  // over this page, at once; everything else goes to Your plan.
  const pill = outOnFree(state) ? (
    <UpgradeLink reason="out" instant aria-label={pillLabel} className={pillClass}>
      {inner}
    </UpgradeLink>
  ) : (
    <Link href={PLAN_HREF} aria-label={pillLabel} className={pillClass}>
      {inner}
    </Link>
  );
  if (!peek) return pill;
  // Hover (after a short pause) or keyboard focus opens the card; clicking the pill still goes to
  // Your plan. Screens without hover (phones) never show it: the plan is under More there.
  return (
    <span
      className={cn(
        "group/peek relative",
        showOnPhone(state) ? "inline-flex" : "hidden md:inline-flex",
      )}
    >
      {pill}
      <span className="invisible absolute top-full right-0 z-50 hidden pt-2 opacity-0 transition-[opacity,visibility] duration-150 group-focus-within/peek:visible group-focus-within/peek:opacity-100 md:block [@media(hover:hover)]:group-hover/peek:visible [@media(hover:hover)]:group-hover/peek:opacity-100 [@media(hover:hover)]:group-hover/peek:delay-150">
        <PeekCard peek={peek} soloReplies={soloReplies} />
      </span>
    </span>
  );
}

/** Ten comb cells for the month's AI replies. */
function PeekComb({ used, allowance }: { used: number; allowance: number }) {
  const cells = 10;
  const full = allowance > 0 ? Math.min(cells, Math.round((used / allowance) * cells)) : 0;
  const r = 8;
  const dx = r * 1.732 + 2;
  const w = Math.ceil(dx * cells + 2);
  return (
    <svg aria-hidden width={w} height={2 * r + 4} viewBox={`0 0 ${w} ${2 * r + 4}`}>
      {Array.from({ length: cells }, (_, i) => {
        const x = r + 1 + i * dx;
        const points = Array.from({ length: 6 }, (_, k) => {
          const a = ((60 * k - 30) * Math.PI) / 180;
          return `${(x + r * Math.cos(a)).toFixed(1)},${(r + 2 + r * Math.sin(a)).toFixed(1)}`;
        }).join(" ");
        return (
          <polygon
            key={i}
            points={points}
            fill={i < full ? "var(--honey)" : "var(--surface)"}
            stroke={i < full ? "var(--ink)" : "var(--line-strong)"}
            strokeWidth="1.3"
          />
        );
      })}
    </svg>
  );
}

const PEEK_BUTTON =
  "bg-ink inline-flex min-h-9 items-center rounded-xl px-3 text-[13px] font-semibold whitespace-nowrap text-white no-underline";

function PeekAction({ peek, soloReplies }: { peek: PlanPeek; soloReplies: number }) {
  switch (peek.action.kind) {
    case "upgrade":
      // Walter's playbook (25 Nov): the link names what it gets, from the plan's number.
      return (
        <UpgradeLink reason="replies" className={PEEK_BUTTON}>
          Get {soloReplies.toLocaleString("en-US")} replies
        </UpgradeLink>
      );
    case "top_up":
      return (
        <Link href={PLAN_HREF} className={PEEK_BUTTON}>
          Add {EXTRAS.topUp.replies} for ${EXTRAS.topUp.usd}
        </Link>
      );
    case "update_card":
      return (
        <Link href={PLAN_HREF} className={PEEK_BUTTON}>
          Update card
        </Link>
      );
    case "call":
      return (
        <a
          href={BUSINESS_CALL_URL}
          target="_blank"
          rel="noreferrer"
          className="text-ink-3 hover:text-ink text-[13px]"
        >
          Changes: talk to Jason
        </a>
      );
    case "none":
      return null;
  }
}

/** The card under the pill (canvas "Plan pill peek + Free and Solo bees", approved 20 Nov). */
function PeekCard({ peek, soloReplies }: { peek: PlanPeek; soloReplies: number }) {
  return (
    <span
      role="group"
      aria-label="Your plan"
      className="border-line bg-surface flex w-[340px] flex-col gap-1.5 rounded-2xl border p-4 text-left whitespace-normal shadow-[0_12px_32px_rgba(23,20,15,0.12)]"
    >
      <span className="text-ink-3 text-xs">Your plan</span>
      <b className="text-base font-semibold">{peek.title}</b>
      <span className="flex flex-col gap-1.5 pt-1 pb-2">
        <PeekComb used={peek.replies.used} allowance={peek.replies.allowance} />
        <span className="text-[13px]">
          <b>
            {peek.replies.used} of {peek.replies.allowance}
          </b>{" "}
          AI replies this month · resets {peek.replies.resets}
        </span>
      </span>
      {peek.rows.map((row) => (
        <span
          key={row.name}
          className="border-line flex items-baseline justify-between gap-3 border-t py-2"
        >
          <span className="text-ink-2 text-sm">{row.name}</span>
          <span className="flex flex-col items-end gap-0.5 text-right">
            <span className={cn("text-sm", row.quiet ? "text-ink-3" : "font-semibold")}>
              {row.value}
            </span>
            {row.note && <span className="text-ink-3 text-xs">{row.note}</span>}
          </span>
        </span>
      ))}
      <span className="border-line flex items-center justify-between gap-3 border-t pt-3">
        {peek.note ? (
          <span className="text-ink-3 max-w-[180px] text-xs">{peek.note}</span>
        ) : (
          <Link href={PLAN_HREF} className="action-link with-arrow text-[13px]">
            Open Your plan
          </Link>
        )}
        <PeekAction peek={peek} soloReplies={soloReplies} />
      </span>
    </span>
  );
}

/** Free out of replies opens the out-of-replies pop-up in place; everything else Your plan. */
const outOnFree = (state: PlanChipState) => state.kind === "reached" && !!state.free;

function summary(state: PlanChipState, renews: string | null): { title: string; line: string } {
  switch (state.kind) {
    case "trial":
      return { title: `${state.planName} · free trial`, line: planChipText(state, true) };
    case "plan":
      return {
        title: renews ? `${state.planName} · renews ${renews}` : state.planName,
        line: `${state.used} of ${state.allowance} replies this month`,
      };
    case "free":
      return { title: "Free", line: `${state.used} of ${state.allowance} replies this month` };
    case "reached":
      return state.free
        ? {
            title: "Replies used up",
            line: "To get more replies this month, upgrade to Solo or above",
          }
        : { title: "Replies used up", line: "Add 200 for $15, or wait for next month" };
    case "past_due":
      return { title: "Card declined", line: "Update your card so Waggle keeps writing" };
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
        {(state.kind === "plan" || state.kind === "free") && (
          <MiniComb used={state.used} allowance={state.allowance} />
        )}
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
          {(state.kind === "plan" || state.kind === "free") && (
            <MiniComb used={state.used} allowance={state.allowance} />
          )}
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
