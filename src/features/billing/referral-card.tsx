import "server-only";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getServiceClient } from "@/lib/supabase/service";
import { runningReferral } from "./promotions";
import { loadPromotions } from "./promotions-store";
import { referralLink } from "./referral-code";
import { loadReferralStats, type ReferralStats } from "./referrals";
import { ReferralShare } from "./referral-share";
import { appUrl } from "./stripe-client";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

async function loadCard(orgId: string): Promise<{ running: boolean; stats: ReferralStats }> {
  const [list, stats] = await Promise.all([
    loadPromotions(),
    loadReferralStats(getServiceClient(), orgId),
  ]);
  return { running: runningReferral(new Date(), list) !== null, stats };
}

/**
 * Your plan: "Give a month, get a month" (Jason, 23 November 2026). The organization's link,
 * one tap to copy or share, and how it's going. The friend's link goes straight to sign-up.
 * Only while the referral program runs (Staff → Promotions): Your plan then shows nothing, and the
 * /refer page (`page`) says it isn't running. Only for paying organizations (Pricing Bible: "Both
 * sides need a card on a paid plan"): on Free, Your plan shows nothing and /refer says how to get
 * a link (start the free month), with no link and no code made. Never breaks the page: a failure shows nothing
 * on Your plan and a quiet line on /refer.
 */
export async function ReferralCard({ orgId, page = false }: { orgId: string; page?: boolean }) {
  const card = await loadCard(orgId).catch((e: unknown) => {
    console.error("billing: referral card failed", {
      orgId,
      error: e instanceof Error ? e.message : "unknown",
    });
    return null;
  });
  if (!card) {
    return page ? (
      <section className="card flex max-w-[1100px] flex-col gap-2 p-6">
        <h1 className="font-display text-[24px] leading-tight font-semibold">Refer a friend</h1>
        <p className="text-ink-2 m-0" role="status">
          Your link didn’t load. Refresh the page to try again.
        </p>
      </section>
    ) : null;
  }
  const { stats } = card;
  if (!stats.code) {
    if (!page) return null;
    return (
      <section className="card flex max-w-[1100px] flex-col gap-3 p-6">
        <h1 className="font-display text-[24px] leading-tight font-semibold">Refer a friend</h1>
        <p className="text-ink-2 m-0">
          Give a month, get a month is for Solo and Team customers. Start your free month to get
          your link.
        </p>
        <Link
          href="/plan?start=solo"
          className={buttonVariants({ variant: "primary", className: "w-fit" })}
        >
          Start your free month
        </Link>
        {stats.joined > 0 && <StatsLine stats={stats} />}
      </section>
    );
  }
  if (!card.running) {
    if (!page) return null;
    return (
      <section className="card flex max-w-[1100px] flex-col gap-2 p-6">
        <h1 className="font-display text-[24px] leading-tight font-semibold">Refer a friend</h1>
        <p className="text-ink-2 m-0">
          Give a month, get a month isn’t running right now. Months you already earned still count.
        </p>
        {stats.joined > 0 && <StatsLine stats={stats} />}
      </section>
    );
  }
  const link = referralLink(appUrl(""), stats.code);
  return (
    <section
      aria-labelledby="referral-title"
      className="card hexbg border-honey-border flex max-w-[1100px] flex-col gap-3 border p-6"
    >
      <span className="text-honey-text text-xs font-bold tracking-wide uppercase">
        Give a month, get a month
      </span>
      <h3 id="referral-title" className="font-display text-[24px] leading-tight font-semibold">
        Know another business owner drowning in DMs?
      </h3>
      <p className="text-ink-2 max-w-[640px]">
        Send them your link. Their first month is free. When their first paid month goes through,
        your next month is free too, for every friend who joins.
      </p>
      <ReferralShare link={link} />
      <p className="meta m-0">Your link shows your business name, nothing else.</p>
      {stats.joined > 0 && <StatsLine stats={stats} />}
    </section>
  );
}

function StatsLine({ stats }: { stats: ReferralStats }) {
  return (
    <p className="meta" role="status">
      {plural(stats.joined, "friend joined", "friends joined")} ·{" "}
      {plural(stats.earned, "free month earned", "free months earned")}
      {stats.banked > 0 &&
        ` · ${plural(stats.banked, "free month", "free months")} waiting for your first plan`}
    </p>
  );
}
