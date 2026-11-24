import { describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

// Staff → Plans saved (QA, 25 Nov): Stripe Checkout's line under a plan comes from the plans as
// staff set them. Mocked Stripe: nothing leaves.

vi.mock("server-only", () => ({}));
const captureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureException: (...a: unknown[]) => captureException(...a),
}));

const { syncPlanProducts } = await import("./stripe-client");
const { PLANS } = await import("./plans");

function fakeStripe(descriptions: Record<string, string>) {
  const update = vi.fn(async () => ({}));
  const list = vi.fn(async ({ lookup_keys }: { lookup_keys: string[] }) => {
    const key = lookup_keys[0]!;
    const plan = key.replace(/^waggle_/, "").replace(/_monthly$/, "");
    return {
      data: [{ product: { id: `prod_${plan}`, deleted: false, description: descriptions[plan] } }],
    };
  });
  return {
    client: { prices: { list }, products: { update } } as unknown as Stripe,
    update,
  };
}

describe("syncing plan products to Stripe", () => {
  it("writes only a description that differs from the plans", async () => {
    const plans = { ...PLANS, solo: { ...PLANS.solo, accounts: 3, replies: 300 } };
    const s = fakeStripe({
      solo: "3 connected accounts, about 200 AI replies a month.",
      business: `${PLANS.business.accounts} connected accounts, about ${PLANS.business.replies.toLocaleString("en-US")} AI replies a month.`,
      team: `${PLANS.team.accounts} connected accounts, about ${PLANS.team.replies.toLocaleString("en-US")} AI replies a month.`,
    });
    expect(await syncPlanProducts(s.client, plans)).toBe(1);
    expect(s.update).toHaveBeenCalledWith("prod_solo", {
      description: "3 connected accounts, about 300 AI replies a month.",
    });
  });

  it("never throws: a Stripe error is reported and the rest still sync", async () => {
    const s = fakeStripe({});
    s.update.mockRejectedValueOnce(new Error("down"));
    expect(await syncPlanProducts(s.client, PLANS)).toBe(2);
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});
