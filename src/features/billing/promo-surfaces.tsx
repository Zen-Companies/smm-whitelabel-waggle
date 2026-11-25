import "server-only";
import { cookies } from "next/headers";
import Link from "next/link";
import { cache } from "react";
import { getServiceClient } from "@/lib/supabase/service";
import { TZ_COOKIE, validTimeZone } from "@/lib/time/zone";
import { loadBilling } from "./billing-store";
import { checkoutTrialDays } from "./plans";
import { isPayingBill } from "./subscription";
import { PromoBarView } from "./promo-bar-view";
import {
  activeBar,
  audienceIncludes,
  BAR_COOKIE,
  barHiddenToday,
  fill,
  inviteState,
  passFor,
  promotionOn,
  REFERRAL_COPY,
  splitLastWord,
} from "./promotions";
import { loadPromotions } from "./promotions-store";
import { referrerForCode, referrerOf } from "./referrals";
import { upgradeHref } from "./upgrade";
import { orgPlanId } from "./usage";

// The promotion surfaces (board "Promotions in the app", approved 24 Nov), all read from the
// promotions list (promotions.ts). Never block a page: a failure just shows nothing.

async function neverPaid(orgId: string): Promise<boolean> {
  return checkoutTrialDays(await loadBilling(getServiceClient(), orgId)) !== null;
}

/** 1 · The moving bar above the navbar (dashboard and setup layouts). */
export async function PromoBar({ orgId, isOwner }: { orgId: string; isOwner: boolean }) {
  const shown = await loadBar(orgId, isOwner).catch((e: unknown) => {
    console.error("billing: promo bar failed", {
      orgId,
      error: e instanceof Error ? e.message : "unknown",
    });
    return null;
  });
  return shown ? (
    <PromoBarView bar={shown.bar} timeZone={shown.zone} popup={shown.popup} />
  ) : null;
}

async function loadBar(orgId: string, isOwner: boolean) {
  const now = new Date();
  const list = await loadPromotions();
  // Only read the bill when some bar's audience depends on it.
  const live = list.some(
    (p) =>
      promotionOn(p, now) &&
      p.bar.enabled &&
      audienceIncludes(p.bar.audience, {
        isOwner,
        neverPaid: true,
        paying: true,
      }),
  );
  if (!live) return null;
  const bill = isOwner ? await loadBilling(getServiceClient(), orgId) : null;
  const bar = activeBar(
    now,
    {
      isOwner,
      neverPaid: isOwner && checkoutTrialDays(bill) !== null,
      paying: isOwner && isPayingBill(bill),
    },
    list,
  );
  if (!bar) return null;
  const jar = await cookies();
  const zone = validTimeZone(jar.get(TZ_COOKIE)?.value ?? null);
  if (barHiddenToday(jar.get(BAR_COOKIE)?.value, bar.promotionId, now, zone)) return null;
  // The upgrade pop-up only opens for an Owner on Free (BillingPopups); anyone else goes to Your
  // plan, so the bar's link always does something (fix 25 Nov).
  const popup = isOwner && orgPlanId(bill) === "free";
  return { bar, zone, popup };
}

/** 2 · Your plan: Walter's pass (Owners of never-paid organizations). */
async function loadPass(orgId: string) {
  if (!(await neverPaid(orgId))) return null;
  const [ref, list] = await Promise.all([referrerOf(getServiceClient(), orgId), loadPromotions()]);
  return passFor(
    { now: new Date(), referred: ref.referred, referredAt: ref.referredAt, referrerName: ref.name },
    list,
  );
}

export async function PromoPass({ orgId }: { orgId: string }) {
  const pass = await loadPass(orgId).catch((e: unknown) => {
    console.error("billing: promo pass failed", {
      orgId,
      error: e instanceof Error ? e.message : "unknown",
    });
    return null;
  });
  if (!pass) return null;
  const [lead, honey] = splitLastWord(pass.headline);
  const href = upgradeHref("nudge", "/plan");
  return (
    <section aria-label={pass.dayName.join(" ")} className="promo-pass-shadow max-w-[1100px]">
      <div className="promo-pass promo-shine flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:gap-[22px] sm:px-[30px]">
        <div className="flex items-center justify-between gap-3 sm:contents">
          <span className="font-display shrink-0 text-[28px] leading-[0.86] font-bold tracking-[-1.5px] uppercase sm:text-[34px]">
            <span className="block">{pass.dayName[0]}</span>
            <span className="promo-outline block">{pass.dayName[1]}</span>
          </span>
        </div>
        <span
          aria-hidden
          className="hidden h-[70px] w-0 shrink-0 border-l-2 border-dashed border-[rgba(246,178,27,0.4)] sm:block"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <h2 className="font-display m-0 text-[20px] leading-[1.2] font-bold sm:text-[22px]">
            {lead}
            <span className="text-honey">{honey}</span>
          </h2>
          <p className="m-0 text-[12.5px] text-[#d9ccb0]">{pass.small}</p>
        </div>
        <div className="flex shrink-0 flex-col items-stretch gap-2 sm:items-end">
          <span
            aria-hidden
            className="font-display text-honey hidden text-[40px] leading-none font-bold tracking-[-2px] sm:block"
          >
            +{pass.trialDays}
            <span className="ml-[3px] text-[13px] tracking-normal">days</span>
          </span>
          <Link
            href={href}
            scroll={false}
            className="bg-honey hover:bg-honey-hover text-ink inline-flex min-h-11 items-center justify-center rounded-[11px] px-4 text-[13px] font-semibold whitespace-nowrap"
          >
            Choose a plan
          </Link>
        </div>
      </div>
    </section>
  );
}

/** One lookup per request, shared by the card and the left panel. */
const inviteFor = cache(async (code: string) => {
  const [who, list] = await Promise.all([
    referrerForCode(getServiceClient(), code),
    loadPromotions(),
  ]);
  return inviteState({ known: who.known, name: who.name, now: new Date() }, list);
});

function CombBee() {
  return (
    <span aria-hidden className="relative grid size-11 shrink-0 place-items-center">
      <svg width="44" height="44" viewBox="0 0 12 12.8" className="absolute inset-0">
        <path
          d="M6 0.6l5 2.9v5.8L6 12.2 1 9.3V3.5z"
          fill="var(--honey)"
          stroke="#17140F"
          strokeWidth=".5"
        />
      </svg>
      <svg width="26" height="21" viewBox="0 0 34 28" className="relative -top-px">
        <ellipse cx="14" cy="8" rx="7" ry="5" fill="#fff" stroke="#17140F" strokeWidth="1.5" />
        <ellipse cx="22" cy="7" rx="6" ry="4.5" fill="#fff" stroke="#17140F" strokeWidth="1.5" />
        <ellipse
          cx="17"
          cy="17"
          rx="10"
          ry="7.5"
          fill="#F6B21B"
          stroke="#17140F"
          strokeWidth="1.6"
        />
        <path d="M13 10.5v13M18 9.8v14.4" stroke="#17140F" strokeWidth="2" />
        <circle cx="26" cy="16" r="1.3" fill="#17140F" />
      </svg>
    </span>
  );
}

/** 3 · Sign-up: the invite card for a friend's link (nothing for an unknown code). */
export async function InviteCard({ code }: { code: string }) {
  const state = await inviteFor(code);
  if (state.kind === "none") return null;
  const name = state.name;
  const c = REFERRAL_COPY;
  if (state.kind === "ended") {
    return (
      <div className="border-line bg-surface mb-4 flex items-center gap-3 rounded-2xl border px-4 py-3.5">
        <CombBee />
        <span className="flex min-w-0 flex-col gap-0.5">
          <b className="font-display text-[16px] leading-tight font-semibold">
            {name ? fill(c.endedTitle, { name }) : c.endedTitleUnknown}
          </b>
          <span className="text-ink-2 text-[13px]">{c.endedSub}</span>
        </span>
      </div>
    );
  }
  return (
    <div
      role="note"
      className="border-honey-border mb-4 flex items-center gap-[13px] rounded-2xl border bg-[linear-gradient(180deg,var(--honey-tint),var(--surface))] px-4 py-3.5 shadow-[0_6px_16px_rgba(246,178,27,0.18)]"
    >
      <CombBee />
      <span className="flex min-w-0 flex-col gap-[3px]">
        <span className="text-honey-text text-[11px] font-bold tracking-[0.8px] uppercase">
          {name ? fill(c.cardKicker, { name }) : c.cardKickerUnknown}
        </span>
        <b className="font-display text-[17px] leading-[1.25] font-semibold">
          {name ? fill(c.cardTitle, { name }) : c.cardTitleUnknown}
        </b>
        <span className="text-ink-2 text-[13px]">{c.cardOffer}</span>
        <span className="text-ink-3 text-[11.5px]">✓ {c.cardApplied}</span>
      </span>
    </div>
  );
}

/** 3 · Sign-up: the dark left panel speaks to invited visitors (computers only). */
export async function InvitePanel({ code }: { code: string }) {
  const state = await inviteFor(code);
  if (state.kind !== "invite") return null;
  const c = REFERRAL_COPY;
  const name = state.name;
  return (
    <div className="flex flex-col gap-2 rounded-[22px] bg-[#17140f] p-[22px] shadow-[0_12px_32px_rgba(23,20,15,0.25)]">
      <span className="text-honey text-[11px] font-bold tracking-[1.2px] uppercase">
        {name ? fill(c.panelKicker, { name }) : c.panelKickerUnknown}
      </span>
      <b className="font-display text-[26px] leading-[1.15] font-semibold text-[#fff6e6]">
        {name ? c.panelTitle : c.panelTitleUnknown}{" "}
        <span className="text-honey">{c.panelTitleHoney}</span>
      </b>
      <span className="text-[13px] text-[#d9ccb0]">{c.panelSub}</span>
    </div>
  );
}
