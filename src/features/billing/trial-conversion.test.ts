import type Stripe from "stripe";
import { describe, expect, it } from "vitest";
import { looksLikeSessionId, trialFromSession } from "./trial-conversion";

type Sess = Parameters<typeof trialFromSession>[0];

function sub(over: Partial<Stripe.Subscription> = {}, lookupKey = "waggle_business_monthly") {
  return {
    status: "trialing",
    trial_end: 1_800_000_000,
    metadata: {},
    items: { data: [{ price: { lookup_key: lookupKey } }] },
    ...over,
  } as unknown as Stripe.Subscription;
}

function session(over: Partial<Sess> = {}): Sess {
  return {
    id: "cs_test_abc1234567",
    status: "complete",
    mode: "subscription",
    client_reference_id: "org-1",
    metadata: { kind: "plan", organization_id: "org-1" },
    subscription: sub(),
    ...over,
  };
}

describe("trialFromSession", () => {
  it("is a trial start for this organization's first plan checkout", () => {
    expect(trialFromSession(session(), "org-1")).toEqual({
      sessionId: "cs_test_abc1234567",
      kind: "trial",
      plan: "business",
      valueUsd: 99,
    });
  });
  it("uses the founding price when the subscription is founding", () => {
    const s = session({ subscription: sub({ metadata: { founding: "1" } }) });
    expect(trialFromSession(s, "org-1")?.valueUsd).toBe(79);
  });
  it("uses each plan's own price", () => {
    const solo = session({ subscription: sub({}, "waggle_solo_monthly") });
    expect(trialFromSession(solo, "org-1")).toMatchObject({ plan: "solo", valueUsd: 49 });
  });
  it("is nothing for another organization's checkout", () => {
    expect(trialFromSession(session(), "org-2")).toBeNull();
  });
  it("is nothing when the checkout isn't finished or isn't a plan", () => {
    expect(trialFromSession(session({ status: "open" }), "org-1")).toBeNull();
    expect(trialFromSession(session({ mode: "payment" }), "org-1")).toBeNull();
    expect(trialFromSession(session({ metadata: { kind: "top_up" } }), "org-1")).toBeNull();
  });
  it("a paid plan straight away (moving up from Free, 19 Nov) is a paid start", () => {
    expect(
      trialFromSession(session({ subscription: sub({ status: "active" }) }), "org-1"),
    ).toMatchObject({ kind: "paid", plan: "business" });
  });
  it("is nothing for a subscription that isn't trialing or active", () => {
    expect(
      trialFromSession(session({ subscription: sub({ status: "incomplete" }) }), "org-1"),
    ).toBeNull();
    expect(
      trialFromSession(session({ subscription: sub({ trial_end: null }) }), "org-1"),
    ).toBeNull();
    expect(trialFromSession(session({ subscription: "sub_123" }), "org-1")).toBeNull();
  });
  it("is nothing when the subscription has no Waggle plan price", () => {
    const s = session({ subscription: sub({}, "something_else") });
    expect(trialFromSession(s, "org-1")).toBeNull();
  });
});

describe("looksLikeSessionId", () => {
  it("accepts Stripe checkout session ids only", () => {
    expect(looksLikeSessionId("cs_live_a1B2c3D4e5F6g7")).toBe(true);
    expect(looksLikeSessionId("cs_test_a1B2c3D4e5F6g7")).toBe(true);
    expect(looksLikeSessionId("{CHECKOUT_SESSION_ID}")).toBe(false);
    expect(looksLikeSessionId("cs_live_<script>")).toBe(false);
    expect(looksLikeSessionId(["cs_live_a1B2c3D4e5F6g7"])).toBe(false);
    expect(looksLikeSessionId(undefined)).toBe(false);
  });
});
