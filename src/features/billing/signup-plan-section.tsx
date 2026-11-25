import "server-only";
import Link from "next/link";
import { connection } from "next/server";
import { cache } from "react";
import { PlanBees } from "@/components/app/bee-plan";
import { START_PLAN_ID, type StartPlan } from "@/lib/checkout-link";
import { getServiceClient } from "@/lib/supabase/service";
import { successReason } from "./banners";
import { loadBilling } from "./billing-store";
import { checkoutTrialDays, isPaidPlanId } from "./plans";
import { signupCheckoutPlan, signupPlanCard, type SignupPlanCard } from "./signup-plan";
import { AutoCheckout } from "./start-checkout-view";
import { getStripe } from "./stripe-client";
import { planIsLive } from "./subscription";
import { loadPlans } from "./usage";

// The site's plan cards (board "From the site's plan card to that plan in the app", option A,
// approved 25 Nov): /signup?plan=solo shows the picked plan beside the form, and setup's first
// page (/welcome?start=solo) opens Stripe Checkout for it once the account exists.

/** The picked plan as Staff → Plans set it, or null (no plan, or one not sold on its own). */
export const loadSignupPlan = cache(
  async (start: StartPlan | null): Promise<SignupPlanCard | null> => {
    if (!start) return null;
    await connection();
    const plans = await loadPlans(getServiceClient());
    return signupPlanCard(start, plans, new Date());
  },
);

export interface SignupPlanLinks {
  /** The same page with the other plan. */
  switchHref: string | null;
  /** The same page without a plan. */
  freeHref: string;
}

function Links({ card, links }: { card: SignupPlanCard; links: SignupPlanLinks }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {card.other && links.switchHref && (
        <Link href={links.switchHref} className="action-link with-arrow">
          Switch to {card.other.name}
        </Link>
      )}
      <Link
        href={links.freeHref}
        className="text-ink-2 hover:text-ink inline-flex min-h-10 items-center text-sm font-semibold transition-colors duration-150"
      >
        Start on Free instead
      </Link>
    </div>
  );
}

/** Desktop: the picked plan fills the left side of sign-up, in place of the moving wall. */
export function SignupPlanPanel({
  card,
  links,
  children,
}: {
  card: SignupPlanCard;
  links: SignupPlanLinks;
  /** Above the plan (a friend's invite). */
  children?: React.ReactNode;
}) {
  return (
    <div className="bg-page flex h-dvh flex-col items-center justify-center gap-5 overflow-y-auto bg-[radial-gradient(circle_at_30%_25%,var(--honey-tint),transparent_60%)] px-10 py-8">
      {children && <div className="w-full max-w-[480px] empty:hidden">{children}</div>}
      <section
        aria-labelledby="your-plan-title"
        className="card flex w-full max-w-[480px] flex-col gap-5 p-8"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-[200px] flex-col gap-2">
            <span className="text-honey-text text-[11px] font-bold tracking-[1.2px] uppercase">
              Your plan
            </span>
            <h2
              id="your-plan-title"
              className="font-display m-0 text-[32px] leading-[1.1] font-semibold tracking-[-0.6px]"
            >
              {card.name}, first month free
            </h2>
          </div>
          <PlanBees plan={START_PLAN_ID[card.start]} />
        </div>
        <ul className="m-0 flex list-none flex-col gap-2.5 p-0 text-[15px]">
          {card.bullets.map((b) => (
            <li key={b} className="flex items-start gap-2.5">
              <span aria-hidden className="text-success w-4 shrink-0 text-center font-extrabold">
                ✓
              </span>
              {b}
            </li>
          ))}
        </ul>
        <p className="border-honey-border bg-honey-tint m-0 rounded-xl border px-4 py-3 text-sm">
          {card.priceLine}
        </p>
        <Links card={card} links={links} />
      </section>
    </div>
  );
}

/** Phones: the picked plan as a compact strip above the form. */
export function SignupPlanStrip({ card, links }: { card: SignupPlanCard; links: SignupPlanLinks }) {
  return (
    <section
      aria-label="Your plan"
      className="border-honey-border bg-honey-tint mb-4 flex flex-col gap-1.5 rounded-[18px] border px-4 py-3 lg:hidden"
    >
      <span className="text-honey-text text-[11px] font-bold tracking-[1.2px] uppercase">
        Your plan
      </span>
      <b className="font-display text-lg leading-tight font-semibold">
        {card.name}, first month free
      </b>
      <span className="text-ink-2 text-[13px]">{card.thenLine}. We email you 3 days before.</span>
      <Links card={card} links={links} />
    </section>
  );
}

/**
 * Setup's first page after sign-up with a plan (/welcome?start=solo): the Owner of their own
 * organization, on Free and never on a plan, goes straight to Stripe Checkout with the first
 * month free (the same form as HighLevel's /plan?start= link). Back with the success pop-up on
 * this page; backing out lands here on Free, no pop-up. Anyone else: nothing, setup as usual.
 */
export async function SignupCheckout({
  orgId,
  personal,
  isOwner,
  start,
}: {
  orgId: string;
  personal: boolean;
  isOwner: boolean;
  start: StartPlan | null;
}) {
  if (!start || !personal || !isOwner || !getStripe()) return null;
  const db = getServiceClient();
  const [bill, plans] = await Promise.all([loadBilling(db, orgId), loadPlans(db)]);
  const planId = signupCheckoutPlan({
    start,
    personal,
    isOwner,
    onPaidPlan: !!bill && planIsLive(bill.status) && isPaidPlanId(bill.plan),
    firstTime: checkoutTrialDays(bill) !== null,
    plans,
  });
  if (!planId) return null;
  return (
    <AutoCheckout
      orgId={orgId}
      planId={planId}
      planName={plans[planId].name}
      back="/welcome"
      reason={successReason(planId)}
      quietCancel
    />
  );
}
