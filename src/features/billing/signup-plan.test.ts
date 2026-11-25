import { describe, expect, it } from "vitest";
import { PLANS, type Plan, type PlanId } from "./plans";
import { signupCheckoutPlan, signupPlanCard } from "./signup-plan";

const plans = PLANS as Record<PlanId, Plan>;
const now = new Date("2026-11-25T12:00:00Z");

describe("signupPlanCard (the site's plan card, 25 Nov)", () => {
  it("Solo: its accounts, replies and auto-reply, $0 today and the date 30 days out", () => {
    expect(signupPlanCard("solo", plans, now)).toEqual({
      start: "solo",
      name: "Solo",
      bullets: [
        "3 social accounts",
        "About 300 replies a month",
        "Replies on its own once you trust it",
      ],
      priceLine: "$0 today. Then $49 a month from December 25. We email you 3 days before.",
      thenLine: "$0 today, then $49 a month from December 25",
      other: { start: "team", name: "Team" },
    });
  });

  it("Team is Waggle's id business; switching offers Solo", () => {
    const card = signupPlanCard("team", plans, now);
    expect(card?.name).toBe("Team");
    expect(card?.bullets[0]).toBe("6 social accounts");
    expect(card?.bullets[1]).toBe("About 750 replies a month");
    expect(card?.priceLine).toContain("Then $99 a month");
    expect(card?.other).toEqual({ start: "solo", name: "Solo" });
  });

  it("reads Staff → Plans: numbers, auto-reply and what's on sale", () => {
    const changed: Record<PlanId, Plan> = {
      ...plans,
      solo: {
        ...plans.solo,
        accounts: 1,
        replies: 1200,
        features: { ...plans.solo.features, autoReply: false },
      },
      business: { ...plans.business, forSale: false },
    };
    const card = signupPlanCard("solo", changed, now);
    expect(card?.bullets).toEqual(["1 social account", "About 1,200 replies a month"]);
    expect(card?.other).toBeNull();
    // A plan off sale: today's page, no plan.
    expect(signupPlanCard("team", changed, now)).toBeNull();
  });

  it("no plan, no card", () => {
    expect(signupPlanCard(null, plans, now)).toBeNull();
  });
});

describe("signupCheckoutPlan (setup's first page after sign-up with a plan)", () => {
  const fresh = {
    personal: true,
    isOwner: true,
    onPaidPlan: false,
    firstTime: true,
    plans,
  };

  it("the Owner of their own organization on Free, never on a plan: Checkout", () => {
    expect(signupCheckoutPlan({ ...fresh, start: "solo" })).toBe("solo");
    expect(signupCheckoutPlan({ ...fresh, start: "team" })).toBe("business");
  });

  it("anyone else carries on with setup", () => {
    expect(signupCheckoutPlan({ ...fresh, start: null })).toBeNull();
    expect(signupCheckoutPlan({ ...fresh, start: "solo", personal: false })).toBeNull();
    expect(signupCheckoutPlan({ ...fresh, start: "solo", isOwner: false })).toBeNull();
    expect(signupCheckoutPlan({ ...fresh, start: "solo", onPaidPlan: true })).toBeNull();
    expect(signupCheckoutPlan({ ...fresh, start: "solo", firstTime: false })).toBeNull();
    const offSale = { ...plans, solo: { ...plans.solo, forSale: false } };
    expect(signupCheckoutPlan({ ...fresh, plans: offSale, start: "solo" })).toBeNull();
  });
});
