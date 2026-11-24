import "server-only";
import { getServiceClient } from "@/lib/supabase/service";
import { referralLink } from "./referral-code";
import { loadReferralStats } from "./referrals";
import { ReferralShare } from "./referral-share";
import { appUrl } from "./stripe-client";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/**
 * Your plan: "Give a month, get a month" (Jason, 23 November 2026). The organization's link,
 * one tap to copy or share, and how it's going. The friend's link goes straight to sign-up.
 */
export async function ReferralCard({ orgId }: { orgId: string }) {
  const stats = await loadReferralStats(getServiceClient(), orgId);
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
      {stats.joined > 0 && (
        <p className="meta" role="status">
          {plural(stats.joined, "friend joined", "friends joined")} ·{" "}
          {plural(stats.earned, "free month earned", "free months earned")}
          {stats.banked > 0 &&
            ` · ${plural(stats.banked, "free month", "free months")} waiting for your first plan`}
        </p>
      )}
    </section>
  );
}
