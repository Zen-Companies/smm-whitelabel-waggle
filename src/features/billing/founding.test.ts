import { beforeEach, describe, expect, it, vi } from "vitest";
import { FOUNDING_CACHE_MS, foundingSpotsLeftCached, resetFoundingCache } from "./founding";

function stripeWith(retrieve: () => Promise<unknown>) {
  return { coupons: { retrieve: vi.fn(retrieve) } } as unknown as Parameters<
    typeof foundingSpotsLeftCached
  >[0];
}

const coupon = (timesRedeemed: number) => ({
  valid: true,
  max_redemptions: 50,
  times_redeemed: timesRedeemed,
});

describe("foundingSpotsLeftCached", () => {
  beforeEach(() => resetFoundingCache());

  it("asks Stripe once, then reuses the answer for a few minutes", async () => {
    const stripe = stripeWith(async () => coupon(10));
    expect(await foundingSpotsLeftCached(stripe, 0)).toBe(true);
    expect(await foundingSpotsLeftCached(stripe, FOUNDING_CACHE_MS - 1)).toBe(true);
    expect(stripe.coupons.retrieve).toHaveBeenCalledTimes(1);
    await foundingSpotsLeftCached(stripe, FOUNDING_CACHE_MS + 1);
    expect(stripe.coupons.retrieve).toHaveBeenCalledTimes(2);
  });

  it("keeps the last known answer when Stripe fails", async () => {
    expect(
      await foundingSpotsLeftCached(
        stripeWith(async () => coupon(10)),
        0,
      ),
    ).toBe(true);
    const down = stripeWith(async () => {
      throw new Error("down");
    });
    expect(await foundingSpotsLeftCached(down, FOUNDING_CACHE_MS + 1)).toBe(true);
  });

  it("is false on an error with nothing known, and when the spots are gone", async () => {
    const down = stripeWith(async () => {
      throw new Error("down");
    });
    expect(await foundingSpotsLeftCached(down, 0)).toBe(false);
    expect(
      await foundingSpotsLeftCached(
        stripeWith(async () => coupon(50)),
        1,
      ),
    ).toBe(false);
  });
});
