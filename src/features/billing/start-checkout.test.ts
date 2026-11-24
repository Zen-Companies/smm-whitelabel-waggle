import { describe, expect, it } from "vitest";
import { PLANS, type Plan, type PlanId } from "./plans";
import { startCheckoutDecision } from "./start-checkout";

const plans = PLANS as Record<PlanId, Plan>;
const owner = { isOwner: true, onPaidPlan: false, plans };

describe("startCheckoutDecision (HighLevel's checkout link, 25 Nov)", () => {
  it("an Owner on Free goes straight to checkout", () => {
    expect(startCheckoutDecision({ ...owner, start: "solo" })).toEqual({
      kind: "checkout",
      planId: "solo",
    });
    // Team is Waggle's id `business`.
    expect(startCheckoutDecision({ ...owner, start: "team" })).toEqual({
      kind: "checkout",
      planId: "business",
    });
  });

  it("a teammate is told to ask the Owner", () => {
    expect(startCheckoutDecision({ ...owner, isOwner: false, start: "solo" })).toEqual({
      kind: "ask_owner",
      planName: "Solo",
    });
  });

  it("nothing without the link, on a paid plan, or when the plan is off sale", () => {
    expect(startCheckoutDecision({ ...owner, start: null }).kind).toBe("none");
    expect(startCheckoutDecision({ ...owner, onPaidPlan: true, start: "solo" }).kind).toBe("none");
    const offSale = { ...plans, solo: { ...plans.solo, forSale: false } };
    expect(startCheckoutDecision({ ...owner, plans: offSale, start: "solo" }).kind).toBe("none");
  });
});
