import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ServiceClient } from "@/lib/supabase/service";
import { promotionToFields } from "./promotion-records";
import { PROMOTIONS } from "./promotions";
import {
  clearPromotionsCache,
  loadPromotionsFresh,
  PROMOTIONS_TTL_MS,
  readPromotions,
} from "./promotions-store";

function fakeDb(result: { data: unknown; error: { message: string } | null } | Error) {
  const order = vi.fn(async () => {
    if (result instanceof Error) throw result;
    return result;
  });
  const select = vi.fn(() => ({ order }));
  const from = vi.fn(() => ({ select }));
  return { db: { from } as unknown as ServiceClient, from };
}

const row = (over: Record<string, unknown> = {}) => ({
  ...promotionToFields(PROMOTIONS[0]),
  created_at: "2026-11-24T16:00:00Z",
  updated_at: "2026-11-24T16:00:00Z",
  updated_by: null,
  ...over,
});

beforeEach(() => {
  clearPromotionsCache();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("reading promotions", () => {
  it("uses the table's rows", async () => {
    const { db } = fakeDb({ data: [row({ trial_days: 45 })], error: null });
    const list = await readPromotions(db);
    expect(list).toHaveLength(1);
    expect(list[0].trialDays).toBe(45);
  });
  it("falls back to the code defaults when the table is empty", async () => {
    const { db } = fakeDb({ data: [], error: null });
    expect(await readPromotions(db)).toBe(PROMOTIONS);
  });
  it("falls back when the read fails or throws", async () => {
    expect(await readPromotions(fakeDb({ data: null, error: { message: "down" } }).db)).toBe(
      PROMOTIONS,
    );
    expect(await readPromotions(fakeDb(new Error("network")).db)).toBe(PROMOTIONS);
  });
  it("caches for a short while, and a save clears it", async () => {
    const { db, from } = fakeDb({ data: [row()], error: null });
    await loadPromotionsFresh(db, 1_000);
    await loadPromotionsFresh(db, 1_000 + PROMOTIONS_TTL_MS - 1);
    expect(from).toHaveBeenCalledTimes(1);
    await loadPromotionsFresh(db, 1_000 + PROMOTIONS_TTL_MS);
    expect(from).toHaveBeenCalledTimes(2);
    clearPromotionsCache();
    await loadPromotionsFresh(db, 1_000 + PROMOTIONS_TTL_MS);
    expect(from).toHaveBeenCalledTimes(3);
  });
});
