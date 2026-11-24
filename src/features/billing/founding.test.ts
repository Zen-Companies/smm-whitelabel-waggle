import { beforeEach, describe, expect, it, vi } from "vitest";
import { isFoundingCoupon } from "./catalog";
import {
  ensureFoundingCoupon,
  FOUNDING_CACHE_MS,
  foundingCouponId,
  foundingCouponMonths,
  foundingRedeemed,
  foundingSpotsLeftCached,
  resetFoundingCache,
} from "./founding";

type Coupons = Parameters<typeof foundingSpotsLeftCached>[0];

async function* listOf(items: unknown[]) {
  for (const i of items) yield i;
}

function stripeWith(retrieve: () => Promise<unknown>, copies: unknown[] = []) {
  return {
    coupons: { retrieve: vi.fn(retrieve), list: vi.fn(() => listOf(copies)) },
  } as unknown as Coupons;
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

describe("the founding price covers 6 paid months after any trial", () => {
  // Stripe counts a repeating coupon's months from when it's applied, trial included.
  it("keeps the 6-month coupon for the usual 7-day trial", () => {
    expect(foundingCouponMonths(7)).toBe(6);
    expect(foundingCouponId(foundingCouponMonths(7))).toBe("waggle_founding_business");
  });
  it("lengthens it by the trial's whole months", () => {
    expect(foundingCouponMonths(30)).toBe(7);
    expect(foundingCouponMonths(90)).toBe(9);
    expect(foundingCouponId(7)).toBe("waggle_founding_business_7m");
    expect(isFoundingCoupon("waggle_founding_business_7m")).toBe(true);
    expect(isFoundingCoupon("waggle_founding_businessx")).toBe(false);
  });
  it("makes the longer copy from the base coupon once", async () => {
    const missing = Object.assign(new Error("No such coupon"), { code: "resource_missing" });
    const base = {
      id: "waggle_founding_business",
      name: "Founding member",
      amount_off: 2000,
      percent_off: null,
      currency: "usd",
      applies_to: { products: ["prod_business"] },
    };
    const retrieve = vi.fn(async (id: string) => {
      if (id === "waggle_founding_business") return base;
      throw missing;
    });
    const create = vi.fn(async (p: { id: string }) => ({ id: p.id }));
    const stripe = { coupons: { retrieve, create } } as unknown as Coupons;
    expect(await ensureFoundingCoupon(stripe, 30)).toBe("waggle_founding_business_7m");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "waggle_founding_business_7m",
        amount_off: 2000,
        currency: "usd",
        duration: "repeating",
        duration_in_months: 7,
        applies_to: { products: ["prod_business"] },
      }),
    );
    expect(await ensureFoundingCoupon(stripe, 7)).toBe("waggle_founding_business");
  });
  it("counts every copy toward the 50 spots", async () => {
    const stripe = stripeWith(
      async () => ({ ...coupon(40), id: "waggle_founding_business" }),
      [
        { id: "waggle_founding_business", times_redeemed: 40 },
        { id: "waggle_founding_business_7m", times_redeemed: 10 },
        { id: "other", times_redeemed: 99 },
      ],
    );
    expect(await foundingRedeemed(stripe)).toEqual({ valid: true, max: 50, redeemed: 50 });
    resetFoundingCache();
    expect(await foundingSpotsLeftCached(stripe, 0)).toBe(false);
  });
});
