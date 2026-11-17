import { Suspense } from "react";
import { CombMeter, PlanBees, RestingBee, TrialCells } from "@/components/app/bee-plan";
import { getServiceClient, type ServiceClient } from "@/lib/supabase/service";
import { loadBilling, loadTopUps, type BillingRecord } from "./billing-store";
import {
  buyTopUp,
  changeExtraAccounts,
  choosePlan,
  openBillingPortal,
  setAutoTopUp,
} from "./plan-actions";
import { PlanButton, PlanCards, type PlanCardData } from "./plan-forms";
import { accountAllowance, EXTRAS, FOUNDING, isPlanId, PLANS, TRIAL, type PlanId } from "./plans";
import { NEVER_DARK, replyLimit, replyLimitNote } from "./reply-limit";
import { getStripe } from "./stripe-client";
import { planIsLive } from "./subscription";
import { loadReplyLimit } from "./usage";

// Settings → Organization → Your plan (T86; approved 17 Nov, canvas "Settings · Your plan, with
// the bee"). One page for the plan, what's used and every extra, self-serve. Owners see it all;
// others see what's counted, not the card.

const day = (d: Date | string) =>
  new Date(d).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });

const BULLETS: Record<PlanId, string[]> = {
  solo: ["3 accounts", "About 200 AI replies a month", "You approve every reply", "Just you"],
  business: [
    "4 accounts",
    "About 750 AI replies a month",
    "Replies on its own, once you trust it",
    "Leads and complaints flagged",
    "Team members and roles",
  ],
  team: ["10 accounts", "About 1,500 AI replies a month", "Everything in Business"],
};

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

/** Pure: which day of the trial it is (1..7), from when it ends. */
export function trialDay(trialEndsAt: Date, now: Date): number {
  const start = trialEndsAt.getTime() - TRIAL.days * 86_400_000;
  return Math.min(TRIAL.days, Math.max(1, Math.ceil((now.getTime() - start) / 86_400_000)));
}

/** Pure: what the plan costs, said the way the header says it. */
export function priceLine(
  bill: Pick<BillingRecord, "plan" | "billing_interval" | "founding" | "trial_ends_at">,
  now: Date = new Date(),
): {
  line: string;
  chargeUsd: number;
  /** The founding price applies right now. */
  founding: boolean;
} {
  const plan = isPlanId(bill.plan) ? PLANS[bill.plan] : PLANS.business;
  if (bill.billing_interval === "year" && plan.yearlyUsd !== null) {
    return {
      line: `$${plan.yearlyUsd} a year. Paid yearly · no contract.`,
      chargeUsd: plan.yearlyUsd,
      founding: false,
    };
  }
  if (bill.founding && bill.plan === FOUNDING.plan) {
    const start = bill.trial_ends_at
      ? new Date(new Date(bill.trial_ends_at).getTime() - TRIAL.days * 86_400_000)
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

async function CardOnFile({ bill }: { bill: BillingRecord }) {
  const stripe = getStripe();
  if (!stripe || !bill.stripe_subscription_id)
    return <span className="text-ink-3">Not set up yet</span>;
  let label: string | null = null;
  let failed = false;
  try {
    const sub = await stripe.subscriptions.retrieve(bill.stripe_subscription_id, {
      expand: ["default_payment_method"],
    });
    const pm = sub.default_payment_method;
    if (pm && typeof pm !== "string" && pm.card) {
      const brand = pm.card.brand.charAt(0).toUpperCase() + pm.card.brand.slice(1);
      label = `${brand} ending ${pm.card.last4}`;
    }
  } catch {
    failed = true;
  }
  if (label) return <span>{label}</span>;
  return (
    <span className="text-ink-3">{failed ? "Couldn't load right now" : "On file with Stripe"}</span>
  );
}

export async function YourPlanSection({
  org,
  notice,
}: {
  org: YourPlanOrg;
  /** From Stripe's return: "done" or "cancelled" after checkout, "top_up" after buying more. */
  notice?: "done" | "cancelled" | "top_up";
}) {
  const db = getServiceClient();
  const now = new Date();
  const [bill, counts, owners] = await Promise.all([
    loadBilling(db, org.id),
    loadCounts(db, org.id),
    ownerNames(db, org.id),
  ]);
  const { accounts } = counts;
  const live = !!bill && planIsLive(bill.status) && isPlanId(bill.plan);
  const planId: PlanId | null = live && isPlanId(bill!.plan) ? bill!.plan : null;
  const fields = { orgId: org.id };

  const cards: PlanCardData[] = (Object.keys(PLANS) as PlanId[]).map((id) => ({
    id,
    name: PLANS[id].name,
    monthlyUsd: PLANS[id].monthlyUsd,
    yearlyUsd: PLANS[id].yearlyUsd,
    forSale: PLANS[id].forSale,
    bullets: BULLETS[id],
  }));
  const firstTime = !bill?.trial_ends_at && !bill?.stripe_subscription_id;
  const foundingNote = firstTime
    ? `The first ${FOUNDING.spots} businesses get ${PLANS[FOUNDING.plan].name} at $${FOUNDING.monthlyUsd} a month for ${FOUNDING.months} months, then $${PLANS[FOUNDING.plan].monthlyUsd}.`
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

  // Stripe not connected on this server yet (no STRIPE_SECRET_KEY) and no plan: what's counted,
  // and plans coming soon, never buttons that can't work. The full page appears once the keys are set.
  if (!getStripe() && !planId) {
    return (
      <div className="flex max-w-[720px] flex-col gap-5">
        {intro}
        <section className="card flex flex-col p-5">
          <div className="border-line flex justify-between gap-4 border-b py-2.5">
            <span className="text-ink-2">Brands</span>
            <b className="font-semibold">{counts.brands}</b>
          </div>
          <div className="border-line flex justify-between gap-4 border-b py-2.5">
            <span className="text-ink-2">Connected accounts</span>
            <b className="font-semibold">{accounts}</b>
          </div>
          <div className="flex justify-between gap-4 py-2.5">
            <span className="text-ink-2">Plans and prices</span>
            <span className="text-ink-3">Coming soon</span>
          </div>
        </section>
        {!org.isOwner && (
          <p className="meta">You see what&apos;s counted, not the card or invoices.</p>
        )}
      </div>
    );
  }

  // No plan yet (or it ended): choose one.
  if (!planId || !bill) {
    const ended = bill?.status === "canceled" && bill.current_period_end;
    return (
      <div className="flex max-w-[960px] flex-col gap-5">
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
            Nothing was charged. Pick a plan whenever you&apos;re ready.
          </p>
        )}
        <section className="card hexbg border-honey-border flex flex-wrap items-center gap-5 border p-6">
          <PlanBees plan="business" />
          <div className="flex min-w-[240px] flex-1 flex-col gap-1">
            <h3 className="font-display text-[26px] font-semibold">
              {ended ? "Your plan has ended" : "Choose your plan"}
            </h3>
            <p className="text-ink-2 text-sm">
              {ended
                ? `It ended on ${day(bill!.current_period_end!)}. Waggle isn't writing replies until you choose a plan again. Your brands, inbox and posts are all still here.`
                : `${TRIAL.days} days free, card up front. Cancel any time before day ${TRIAL.days} and you pay nothing.`}
            </p>
          </div>
        </section>
        <section id="change-plan" className="flex flex-col gap-3">
          <PlanCards
            orgId={org.id}
            plans={cards}
            current={null}
            currentInterval={null}
            live={false}
            mayChange={org.isOwner}
            foundingNote={foundingNote}
            action={choosePlan}
          />
        </section>
        <Counted accounts={accounts} />
      </div>
    );
  }

  const plan = PLANS[planId];
  const status = await loadReplyLimit(db, org.id, now);
  const limit = status?.limit ?? replyLimit(0, plan.replies, now);
  const note = replyLimitNote(limit, planId);
  const topUps = await loadTopUps(db, org.id, planId, now);
  const allowance = accountAllowance(planId, bill.extra_accounts);
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
          <TrialCells day={trialDay(new Date(bill.trial_ends_at), now)} of={TRIAL.days} />
          <span className="min-w-[240px] flex-1 text-sm">
            <b>
              Free trial: day {trialDay(new Date(bill.trial_ends_at), now)} of {TRIAL.days}.
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
                <PlanButton
                  action={buyTopUp}
                  fields={fields}
                  label={`+${EXTRAS.topUp.replies} replies for $${EXTRAS.topUp.usd}`}
                  honey
                  className="items-start"
                />
                {planId === "solo" && (
                  <PlanButton
                    action={choosePlan}
                    fields={{
                      ...fields,
                      plan: "business",
                      interval: bill.billing_interval ?? "month",
                    }}
                    label="Upgrade to Business"
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
              <PlanButton
                action={buyTopUp}
                fields={fields}
                label={`Buy ${EXTRAS.topUp.replies} more`}
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
                  <Suspense fallback={<span className="text-ink-3">…</span>}>
                    <CardOnFile bill={bill} />
                  </Suspense>
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

function Counted({ accounts }: { accounts: number }) {
  return (
    <p className="meta">
      Connected accounts right now: {accounts}. Each plan includes some; extras are $
      {EXTRAS.accountUsd} a month each.
    </p>
  );
}
