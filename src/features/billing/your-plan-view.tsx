import { Suspense } from "react";
import { UsageAtCostCard } from "./usage-at-cost-card";
import { CombMeter, PlanBees, RestingBee, TrialCells } from "@/components/app/bee-plan";
import { getServiceClient, type ServiceClient } from "@/lib/supabase/service";
import { loadBilling, loadTopUps, type BillingRecord } from "./billing-store";
import {
  buyTopUpNow,
  changeExtraAccounts,
  choosePlan,
  openBillingPortal,
  setAutoTopUp,
} from "./plan-actions";
import {
  PlanButton,
  PlanCards,
  TopUpButton,
  type FoundingOffer,
  type PlanCardData,
} from "./plan-forms";
import { foundingSpotsLeft } from "./founding";
import { offerTrialDays } from "./referrals";
import { cardLabel } from "./auto-top-up";
import {
  accountAllowance,
  EXTRAS,
  FOUNDING,
  checkoutTrialDays,
  isPaidPlanId,
  perDay,
  planBullets,
  PLAN_IDS,
  PLANS,
  TRIAL,
  type PaidPlanId,
  type Plan,
  type PlanId,
} from "./plans";
import { UPGRADE, upgradeCopy, upgradeLabel, upgradeLine, type UpgradeReason } from "./upgrade";
import { NEVER_DARK, replyLimit, replyLimitNote } from "./reply-limit";
import { getStripe } from "./stripe-client";
import { planIsLive } from "./subscription";
import { loadPlans, loadReplyLimit } from "./usage";

// Settings → Organization → Your plan (T86; approved 17 Nov, canvas "Settings · Your plan, with
// the bee"). One page for the plan, what's used and every extra, self-serve. Owners see it all;
// others see what's counted, not the card.

const day = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });

export interface YourPlanOrg {
  id: string;
  name: string;
  /** The Owner manages the bill (billing.view). */
  isOwner: boolean;
}

async function loadCounts(
  db: ServiceClient,
  orgId: string,
): Promise<{ brands: number; accounts: number }> {
  const { data: brands } = await db
    .from("tenants")
    .select("id")
    .eq("organization_id", orgId)
    .is("offboarded_at", null);
  const ids = (brands ?? []).map((b) => b.id);
  if (ids.length === 0) return { brands: 0, accounts: 0 };
  const { count } = await db
    .from("social_accounts")
    .select("id", { count: "exact", head: true })
    .in("tenant_id", ids)
    .eq("status", "active");
  return { brands: ids.length, accounts: count ?? 0 };
}

async function ownerNames(db: ServiceClient, orgId: string): Promise<string> {
  const { data } = await db.rpc("organization_team", { p_org: orgId });
  const names = (data ?? []).filter((m) => m.role === "owner").map((m) => m.full_name ?? m.email);
  return names.join(" and ") || "the Owner";
}

/** Pure: which day of the trial it is (1..length), from when it ends. 7 days, or 30 with the free month. */
export function trialDay(trialEndsAt: Date, now: Date, length: number = TRIAL.days): number {
  const start = trialEndsAt.getTime() - length * 86_400_000;
  return Math.min(length, Math.max(1, Math.ceil((now.getTime() - start) / 86_400_000)));
}

/** Pure: what the plan costs, said the way the header says it. */
export function priceLine(
  bill: Pick<BillingRecord, "plan" | "billing_interval" | "founding" | "trial_ends_at"> & {
    trial_days?: number | null;
  },
  now: Date = new Date(),
): {
  line: string;
  chargeUsd: number;
  /** The founding price applies right now. */
  founding: boolean;
} {
  const plan = isPaidPlanId(bill.plan) ? PLANS[bill.plan] : PLANS.business;
  if (bill.billing_interval === "year" && plan.yearlyUsd !== null) {
    return {
      line: `$${plan.yearlyUsd} a year. Paid yearly · no contract.`,
      chargeUsd: plan.yearlyUsd,
      founding: false,
    };
  }
  if (bill.founding && bill.plan === FOUNDING.plan) {
    const start = bill.trial_ends_at
      ? new Date(
          new Date(bill.trial_ends_at).getTime() - (bill.trial_days ?? TRIAL.days) * 86_400_000,
        )
      : new Date();
    const until = new Date(start);
    until.setUTCMonth(until.getUTCMonth() + FOUNDING.months);
    if (now < until)
      return {
        line: `$${FOUNDING.monthlyUsd} a month until ${day(until)}, then $${plan.monthlyUsd}. Paid monthly · no contract.`,
        chargeUsd: FOUNDING.monthlyUsd,
        founding: true,
      };
  }
  return {
    line: `$${plan.monthlyUsd} a month. Paid monthly · no contract.`,
    chargeUsd: plan.monthlyUsd,
    founding: false,
  };
}

function Row({
  label,
  value,
  children,
}: {
  label: string;
  value: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="border-line flex flex-wrap items-center justify-between gap-3 border-t py-3">
      <span className="text-ink-2">{label}</span>
      <span className="flex flex-wrap items-center justify-end gap-3">
        {value}
        {children}
      </span>
    </div>
  );
}

/** The saved card's label, or null (Stripe not set up, no card, or Stripe didn't answer). */
async function loadCardLabel(bill: BillingRecord): Promise<string | null> {
  const stripe = getStripe();
  if (!stripe) return null;
  try {
    return await cardLabel(stripe, bill);
  } catch {
    return null;
  }
}

export async function YourPlanSection({
  org,
  notice,
  upgrade,
}: {
  org: YourPlanOrg;
  /** From Stripe's return: "done" or "cancelled" after checkout, "top_up" after buying more. */
  notice?: "done" | "cancelled" | "top_up";
  /** Opened from a limit: the upgrade screen for it on top (Free plan, 20 Nov). */
  upgrade?: UpgradeReason;
}) {
  const db = getServiceClient();
  const now = new Date();
  const [bill, counts, owners, plans] = await Promise.all([
    loadBilling(db, org.id),
    loadCounts(db, org.id),
    ownerNames(db, org.id),
    loadPlans(db),
  ]);
  const { accounts } = counts;
  const live = !!bill && planIsLive(bill.status) && isPaidPlanId(bill.plan);
  const planId: PaidPlanId | null = live && isPaidPlanId(bill!.plan) ? bill!.plan : null;
  const fields = { orgId: org.id };

  const cards: PlanCardData[] = PLAN_IDS.map((id) => ({
    id,
    name: plans[id].name,
    monthlyUsd: plans[id].monthlyUsd,
    yearlyUsd: plans[id].yearlyUsd,
    forSale: plans[id].forSale,
    bullets: planBullets(plans[id]),
  }));
  // The first paid plan starts with 7 days free, with a card (trial back, 20 Nov).
  const firstTime = checkoutTrialDays(bill) !== null;
  // Black Friday and referrals (23 Nov): 30 days instead of 7, said everywhere the trial is.
  const offerDays = (await offerTrialDays(db, org.id, bill, now)) ?? TRIAL.days;
  // Founding offer, highlighted (approved 20 Nov): a banner and the Team card, while spots last.
  const stripe = getStripe();
  const founding: FoundingOffer | null =
    firstTime && stripe && (await foundingSpotsLeft(stripe))
      ? {
          plan: FOUNDING.plan,
          monthlyUsd: FOUNDING.monthlyUsd,
          months: FOUNDING.months,
          spots: FOUNDING.spots,
        }
      : null;

  const intro = (
    <div className="flex flex-col gap-1">
      <h2 className="section-title">Your plan</h2>
      <p className="text-ink-2">
        One plan for the whole of {org.name}, covering all its brands.{" "}
        {org.isOwner ? "You manage it as its Owner." : `Managed by ${owners} (Owner).`}
      </p>
    </div>
  );

  // Free (19 Nov): no paid plan, or it ended. What's used, the upgrade, then the plans.
  if (!planId || !bill) {
    const ended = bill?.status === "canceled" && bill.current_period_end;
    const free = plans.free;
    const status = await loadReplyLimit(db, org.id, now);
    const limit = status?.limit ?? replyLimit(0, free.replies, now);
    return (
      <div className="flex max-w-[1100px] flex-col gap-5">
        {intro}
        {notice === "done" && (
          <p
            className="border-honey-border bg-honey-tint rounded-xl border px-4 py-3 text-sm"
            role="status"
          >
            <b>Thanks!</b> Stripe is confirming your plan. This page shows it in a few seconds:
            reload if it doesn&apos;t.
          </p>
        )}
        {notice === "cancelled" && (
          <p className="text-ink-2 text-sm" role="status">
            Nothing was charged. You&apos;re still on Free.
          </p>
        )}
        {upgrade && (
          <UpgradePanel
            reason={upgrade}
            orgId={org.id}
            isOwner={org.isOwner}
            owners={owners}
            plans={plans}
            live={false}
            trial={firstTime}
            trialDays={offerDays}
          />
        )}
        <section className="card hexbg border-honey-border flex flex-col gap-4 border p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-5">
              <PlanBees plan="free" />
              <div className="flex flex-col gap-1">
                <h3 className="font-display text-[30px] leading-tight font-semibold">Free</h3>
                <span className="text-ink-2 text-sm">
                  {ended
                    ? `Your paid plan ended on ${day(bill!.current_period_end!)}. You’re on Free now: everything you set up is still here.`
                    : "No card, no time limit. Waggle drafts, you approve."}
                </span>
              </div>
            </div>
            {org.isOwner && getStripe() && (
              <PlanButton
                action={choosePlan}
                fields={{ ...fields, plan: "solo", interval: "month" }}
                label={
                  firstTime
                    ? `Try ${plans.solo.name}: ${offerDays} days free`
                    : `Upgrade to ${plans.solo.name}`
                }
                pendingLabel="Starting…"
                honey
              />
            )}
          </div>
          {org.isOwner && getStripe() && firstTime && (
            <span className="meta">
              {offerDays} days free, then ${plans.solo.monthlyUsd} a month (
              {perDay(plans.solo.monthlyUsd)}). Cancel before day {offerDays} and you pay nothing.
            </span>
          )}
          <div className="text-ink-2 flex flex-wrap items-center gap-x-8 gap-y-3 text-sm">
            <span className="flex items-center gap-3">
              <CombMeter used={limit.used} allowance={limit.allowance} size={11} />
              <span>
                <b className="text-ink">
                  {limit.used} of {limit.allowance}
                </b>{" "}
                replies this month · resets {day(limit.resetsAt)}
              </span>
            </span>
            <span>
              <b className="text-ink">
                {accounts} of {free.accounts}
              </b>{" "}
              account{free.accounts === 1 ? "" : "s"} connected
            </span>
          </div>
          <span className="meta">
            Replies count when you approve a draft. Extra accounts (${EXTRAS.accountUsd} each) and
            reply top-ups (${EXTRAS.topUp.usd} for {EXTRAS.topUp.replies}) are on paid plans.{" "}
            {upgradeLine("top_up")}
          </span>
        </section>
        {getStripe() ? (
          <section id="change-plan" className="flex scroll-mt-6 flex-col gap-3">
            <h3 className="text-base font-semibold">Plans</h3>
            <PlanCards
              orgId={org.id}
              plans={cards}
              current="free"
              currentInterval={null}
              live={false}
              mayChange={org.isOwner}
              foundingNote={null}
              founding={founding}
              trial={firstTime}
              trialDays={offerDays}
              freeLine={`${limit.used} of ${limit.allowance} AI replies used this month`}
              action={choosePlan}
            />
            <span className="meta">
              {firstTime
                ? "Cancel any time and you go back to Free."
                : "Paid plans are charged at checkout. Cancel any time and you go back to Free."}
            </span>
          </section>
        ) : (
          <p className="meta">Paid plans aren&apos;t set up on this server yet.</p>
        )}
        {!org.isOwner && (
          <p className="meta">You see what&apos;s counted, not the card or invoices.</p>
        )}
      </div>
    );
  }

  const plan = plans[planId];
  const status = await loadReplyLimit(db, org.id, now);
  const limit = status?.limit ?? replyLimit(0, plan.replies, now);
  const note = replyLimitNote(limit, planId);
  const [topUps, card] = await Promise.all([
    loadTopUps(db, org.id, plan.replies, now),
    org.isOwner ? loadCardLabel(bill) : Promise.resolve(null),
  ]);
  const allowance = accountAllowance(plan, bill.extra_accounts);
  const price = priceLine(bill);
  // The first charge after the trial: the plan plus any extra accounts.
  const firstCharge =
    price.chargeUsd +
    bill.extra_accounts * EXTRAS.accountUsd * (bill.billing_interval === "year" ? 12 : 1);
  const perCell = Math.round(limit.allowance / 10);

  return (
    <div className="flex max-w-[960px] flex-col gap-5">
      {intro}
      {notice === "done" && (
        <p
          className="border-honey-border bg-honey-tint rounded-xl border px-4 py-3 text-sm"
          role="status"
        >
          <b>You&apos;re on {plan.name}.</b> Waggle keeps writing replies for all of {org.name}
          &apos;s brands.
        </p>
      )}
      {notice === "top_up" && (
        <p
          className="border-honey-border bg-honey-tint rounded-xl border px-4 py-3 text-sm"
          role="status"
        >
          <b>{EXTRAS.topUp.replies} more replies are on their way.</b> They show here in a few
          seconds, and Stripe emails the receipt.
        </p>
      )}

      {upgrade && PLAN_IDS.indexOf(UPGRADE[upgrade].plan) > PLAN_IDS.indexOf(planId) && (
        <UpgradePanel
          reason={upgrade}
          orgId={org.id}
          isOwner={org.isOwner}
          owners={owners}
          plans={plans}
          live
          interval={bill.billing_interval === "year" ? "year" : "month"}
        />
      )}

      {bill.status === "past_due" && (
        <section className="border-danger/40 bg-danger-soft flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
          <span className="text-sm">
            <b>Your last payment didn&apos;t go through.</b> Stripe tries again over the next days.
            Update your card so Waggle keeps writing.
          </span>
          {org.isOwner && (
            <PlanButton action={openBillingPortal} fields={fields} label="Update card" honey />
          )}
        </section>
      )}

      {bill.status === "trialing" && bill.trial_ends_at && (
        <section className="border-honey-border bg-honey-tint flex flex-wrap items-center gap-4 rounded-xl border px-4 py-3">
          {/* One hexagon a day fits 7; a 30-day free month says it in words only. */}
          {(bill.trial_days ?? TRIAL.days) <= TRIAL.days && (
            <TrialCells
              day={trialDay(new Date(bill.trial_ends_at), now, bill.trial_days ?? TRIAL.days)}
              of={bill.trial_days ?? TRIAL.days}
            />
          )}
          <span className="min-w-[240px] flex-1 text-sm">
            <b>
              Free trial: day{" "}
              {trialDay(new Date(bill.trial_ends_at), now, bill.trial_days ?? TRIAL.days)} of{" "}
              {bill.trial_days ?? TRIAL.days}.
            </b>{" "}
            {bill.cancel_at_period_end
              ? `It ends on ${day(bill.trial_ends_at)} and you won't be charged.`
              : `Your card is charged $${firstCharge} on ${day(bill.trial_ends_at)}. Cancel any time before then and you pay nothing.`}
          </span>
          {bill.cancel_at_period_end && org.isOwner && (
            <PlanButton action={openBillingPortal} fields={fields} label="Keep my plan" />
          )}
        </section>
      )}

      {bill.cancel_at_period_end && bill.status !== "trialing" && bill.current_period_end && (
        <section className="border-line bg-subtle flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3">
          <span className="text-sm">
            <b>Your plan ends on {day(bill.current_period_end)}.</b> Until then everything keeps
            working.
          </span>
          {org.isOwner && (
            <PlanButton action={openBillingPortal} fields={fields} label="Keep my plan" />
          )}
        </section>
      )}

      <section className="card hexbg border-honey-border flex flex-wrap items-center justify-between gap-4 border p-6">
        <div className="flex flex-wrap items-center gap-5">
          <PlanBees plan={planId} />
          <div className="flex flex-col gap-1">
            {price.founding && (
              <span className="bg-honey text-ink w-fit rounded-full px-2.5 py-0.5 text-xs font-semibold">
                Founding member
              </span>
            )}
            <h3 className="font-display text-[30px] leading-tight font-semibold">{plan.name}</h3>
            <span className="text-ink-2 text-sm">{price.line}</span>
          </div>
        </div>
        <a href="#change-plan" className="action-link text-sm">
          Change plan
        </a>
      </section>

      <section className="card flex flex-col p-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <b className="text-[15px] font-semibold">AI replies this month</b>
          <span className="text-sm">
            <b className="font-display text-[22px] font-semibold">
              {limit.used.toLocaleString("en-US")}
            </b>{" "}
            of {limit.allowance.toLocaleString("en-US")}
          </span>
        </div>
        <div className="mt-3 mb-1.5 flex items-center gap-4">
          <CombMeter used={limit.used} allowance={limit.allowance} />
          {limit.level === "reached" && <RestingBee />}
        </div>
        <span className="meta">
          Each cell is {perCell} replies. Waggle refills the comb on {day(limit.resetsAt)}.
          {topUps.carried > 0 && ` Includes ${topUps.carried} carried over from last month.`}
        </span>
        {note && (
          <div
            role="status"
            className={
              limit.level === "reached"
                ? "border-honey bg-honey-tint mt-4 flex flex-col gap-2 rounded-xl border p-4"
                : "border-honey-border bg-honey-tint mt-4 rounded-xl border px-4 py-3"
            }
          >
            <b className="text-[15px]">{note.title}</b>
            <span className="text-ink-2 text-sm">
              {limit.level === "reached" ? note.body : `${note.body}`}
            </span>
            {limit.level === "reached" && org.isOwner && (
              <div className="flex flex-wrap gap-2">
                <TopUpButton
                  action={buyTopUpNow}
                  orgId={org.id}
                  card={card}
                  label={`+${EXTRAS.topUp.replies} replies for $${EXTRAS.topUp.usd}`}
                  usd={EXTRAS.topUp.usd}
                  replies={EXTRAS.topUp.replies}
                  honey
                />
                {planId === "solo" && (
                  <PlanButton
                    action={choosePlan}
                    fields={{
                      ...fields,
                      plan: "business",
                      interval: bill.billing_interval ?? "month",
                    }}
                    label={`Upgrade to ${PLANS.business.name}`}
                    className="items-start"
                  />
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-4">
          <Row
            label="Connected accounts"
            value={
              <b className="font-semibold">
                {accounts} of {allowance}
                {bill.extra_accounts > 0 && (
                  <span className="text-ink-3 font-normal">
                    {" "}
                    · includes {bill.extra_accounts} extra
                  </span>
                )}
              </b>
            }
          >
            {org.isOwner && (
              <>
                {bill.extra_accounts > 0 && (
                  <PlanButton
                    action={changeExtraAccounts}
                    fields={{ ...fields, delta: "-1" }}
                    label="Remove one"
                    quiet
                  />
                )}
                <PlanButton
                  action={changeExtraAccounts}
                  fields={{ ...fields, delta: "1" }}
                  label={`+ Add an account · $${EXTRAS.accountUsd}/mo`}
                />
              </>
            )}
          </Row>
          <Row
            label="Extra replies"
            value={
              <span>
                +{EXTRAS.topUp.replies} for ${EXTRAS.topUp.usd}, one time
                {topUps.thisMonth > 0 && (
                  <span className="text-ink-3"> · {topUps.thisMonth} bought this month</span>
                )}
              </span>
            }
          >
            {org.isOwner && limit.level !== "reached" && (
              <TopUpButton
                action={buyTopUpNow}
                orgId={org.id}
                card={card}
                label={`Buy ${EXTRAS.topUp.replies} more`}
                usd={EXTRAS.topUp.usd}
                replies={EXTRAS.topUp.replies}
              />
            )}
          </Row>
          <Row
            label="Automatic top-up"
            value={
              <span className="text-ink-3 text-sm">
                {bill.auto_top_up ? "On" : "Off"} · at most {EXTRAS.autoTopUp.maxPerMonth} a month,
                email receipt each time
              </span>
            }
          >
            {org.isOwner && (
              <PlanButton
                action={setAutoTopUp}
                fields={{ ...fields, on: bill.auto_top_up ? "0" : "1" }}
                label={bill.auto_top_up ? "Turn off" : "Turn on"}
              />
            )}
          </Row>
          {plan.yearlyUsd !== null && !price.founding && (
            <Row
              label={bill.billing_interval === "year" ? "Pay monthly" : "Pay yearly"}
              value={
                <span className="text-ink-3 text-sm">
                  {bill.billing_interval === "year"
                    ? `$${plan.monthlyUsd} a month`
                    : `$${plan.yearlyUsd} a year, 2 months free`}
                </span>
              }
            >
              {org.isOwner && (
                <PlanButton
                  action={choosePlan}
                  fields={{
                    ...fields,
                    plan: planId,
                    interval: bill.billing_interval === "year" ? "month" : "year",
                  }}
                  label={
                    bill.billing_interval === "year" ? "Switch to monthly" : "Switch to yearly"
                  }
                />
              )}
            </Row>
          )}
          {org.isOwner && (
            <>
              <Row
                label="Payment method"
                value={
                  <span className={card ? undefined : "text-ink-3"}>
                    {card ?? "On file with Stripe"}
                  </span>
                }
              >
                <PlanButton action={openBillingPortal} fields={fields} label="Change" />
              </Row>
              <Row
                label="Invoices and cancelling"
                value={<span className="text-ink-3 text-sm">In Stripe&apos;s billing page</span>}
              >
                <PlanButton action={openBillingPortal} fields={fields} label="Open" quiet />
              </Row>
            </>
          )}
        </div>
      </section>
      {!org.isOwner && (
        <p className="meta">You see what&apos;s counted, not the card or invoices.</p>
      )}

      {bill && (
        <Suspense fallback={null}>
          <UsageAtCostCard orgId={org.id} bill={bill} />
        </Suspense>
      )}

      <section id="change-plan" className="flex scroll-mt-6 flex-col gap-3">
        <h3 className="text-base font-semibold">Change plan</h3>
        <PlanCards
          orgId={org.id}
          plans={cards}
          current={planId}
          currentInterval={bill.billing_interval === "year" ? "year" : "month"}
          live
          mayChange={org.isOwner}
          foundingNote={
            price.founding
              ? `Your founding price is for ${PLANS[FOUNDING.plan].name} monthly: moving to another plan or to yearly leaves it.`
              : null
          }
          action={choosePlan}
        />
        <span className="meta">
          Moving up or down is prorated: you pay or get credit for the rest of this period.{" "}
          {NEVER_DARK}
        </span>
      </section>
    </div>
  );
}

/**
 * The upgrade screen (Free plan, approved 20 Nov): one screen, opened from every limit
 * (`/plan?upgrade=<reason>`). Its title says which limit was hit, then "To …, upgrade to Solo or
 * above" and the plan that lifts it. Never an add-on.
 */
function UpgradePanel({
  reason,
  orgId,
  isOwner,
  owners,
  plans,
  live,
  interval = "month",
  trial = false,
  trialDays = TRIAL.days,
}: {
  reason: UpgradeReason;
  orgId: string;
  isOwner: boolean;
  owners: string;
  plans: Record<PlanId, Plan>;
  live: boolean;
  interval?: "month" | "year";
  /** The first paid plan starts with a free trial. */
  trial?: boolean;
  /** How long: 7 days, or 30 with the Black Friday or referral month. */
  trialDays?: number;
}) {
  // Numbers from the plans as staff set them (decision 10).
  const copy = upgradeCopy(reason, plans);
  const target = plans[copy.plan];
  return (
    <section
      id="upgrade"
      aria-labelledby="upgrade-title"
      className="border-honey bg-surface flex scroll-mt-6 flex-col gap-3 rounded-2xl border-2 p-6 shadow-[0_18px_50px_rgba(23,20,15,0.10)]"
    >
      <span className="text-honey-text text-xs font-bold tracking-wide uppercase">
        {live ? "Plan limit" : "Free plan limit"}
      </span>
      <h3 id="upgrade-title" className="font-display text-[24px] leading-tight font-semibold">
        {copy.title}
      </h3>
      <p className="text-ink-2 max-w-[640px]">{copy.why}</p>
      <b className="text-[15px]">{upgradeLine(reason)}</b>
      <div className="bg-page border-line flex max-w-[480px] flex-col gap-1.5 rounded-xl border px-4 py-3.5 text-sm">
        <span className="flex justify-between gap-4">
          <b className="font-display text-lg font-semibold">{target.name}</b>
          <b>${target.monthlyUsd}/mo</b>
        </span>
        <span className="meta">{perDay(target.monthlyUsd)}</span>
        {planBullets(target)
          .slice(1, 4)
          .map((b) => (
            <span key={b} className="text-ink-2">
              {b}
            </span>
          ))}
      </div>
      {isOwner ? (
        <div className="flex flex-wrap items-center gap-4">
          {getStripe() ? (
            <PlanButton
              action={choosePlan}
              fields={{ orgId, plan: copy.plan, interval }}
              label={trial ? `Start ${trialDays} days free` : upgradeLabel(reason)}
              pendingLabel="Starting…"
              honey
              className="items-start"
            />
          ) : (
            <span className="meta">Paid plans aren&apos;t set up on this server yet.</span>
          )}
          <a href="/plan" className="action-link text-sm">
            Not now
          </a>
        </div>
      ) : (
        <p className="text-ink-2 text-sm">Ask {owners} (Owner) to upgrade the plan.</p>
      )}
      {!live && (
        <span className="meta">
          {trial
            ? `A card starts your trial: ${trialDays} days free, then $${target.monthlyUsd} a month. Cancel before day ${trialDays} and you pay nothing.`
            : "Card at checkout. Cancel any time and you go back to Free."}
        </span>
      )}
    </section>
  );
}
