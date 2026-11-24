import { beforeEach, describe, expect, it, vi } from "vitest";

// The permission gate: a Server Action is reachable without the page, so each one checks
// `admin.caps.manage` before touching anything.

const hasPermission = vi.fn<(p: string) => Promise<boolean>>();
const from = vi.fn();

vi.mock("@/features/staff", () => ({ hasPermission: (p: string) => hasPermission(p) }));
vi.mock("@/lib/supabase/server", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "u1", email: "staff@example.com" })),
}));
vi.mock("@/lib/supabase/service", () => ({ getServiceClient: () => ({ from }) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
const captureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureException: (...a: unknown[]) => captureException(...a),
}));

const { createPromotion, setPromotionEnabled, updatePromotion } =
  await import("./promotion-actions");
const { HISTORY_FAILED } = await import("./promotion-records");

function fd(values: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

beforeEach(() => {
  hasPermission.mockReset();
  from.mockReset();
  captureException.mockReset();
});

describe("Staff → Promotions actions", () => {
  it("refuse anyone without admin.caps.manage, before reading or writing", async () => {
    hasPermission.mockResolvedValue(false);
    const form = fd({ id: "black-friday-2026", kind: "seasonal", name: "X", enabled: "on" });
    expect(await createPromotion({}, form)).toEqual({ error: "Not available." });
    expect(await updatePromotion({}, form)).toEqual({ error: "Not available." });
    expect(await setPromotionEnabled({}, form)).toEqual({ error: "Not available." });
    expect(hasPermission).toHaveBeenCalledWith("admin.caps.manage");
    expect(from).not.toHaveBeenCalled();
  });

  it("check the form before saving", async () => {
    hasPermission.mockResolvedValue(true);
    expect(await createPromotion({}, fd({ kind: "seasonal", id: "X!", name: "Xmas" }))).toEqual({
      error: "Short name: 3–40 lowercase letters, digits or dashes.",
    });
    expect(
      await updatePromotion({}, fd({ id: "black-friday-2026", name: "BF", trial_days: "120" })),
    ).toHaveProperty("error");
    expect(from).not.toHaveBeenCalled();
  });
});

describe("the history entry", () => {
  /** promotions: the row reads and saves; promotion_changes: the insert fails. */
  function tables(historyError: { message: string; code?: string } | null) {
    from.mockImplementation((table: string) => {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: { enabled: false }, error: null }),
        update: () => ({ eq: async () => ({ error: null }) }),
        insert: async () => ({ error: table === "promotion_changes" ? historyError : null }),
      };
      return q;
    });
  }

  it("a failed history insert is reported (ids only) and said in place", async () => {
    hasPermission.mockResolvedValue(true);
    tables({ message: "boom", code: "42501" });
    const form = fd({ id: "black-friday-2026", enabled: "on" });
    expect(await setPromotionEnabled({}, form)).toEqual({ error: HISTORY_FAILED });
    expect(HISTORY_FAILED).toMatch(/^Saved, but the history entry failed/);
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(captureException.mock.calls[0]?.[1]).toEqual({
      extra: {
        promotionId: "black-friday-2026",
        action: "enabled",
        changedBy: "u1",
        code: "42501",
      },
    });
  });

  it("a kept history entry is just saved", async () => {
    hasPermission.mockResolvedValue(true);
    tables(null);
    const form = fd({ id: "black-friday-2026", enabled: "on" });
    expect(await setPromotionEnabled({}, form)).toEqual({ saved: true });
    expect(captureException).not.toHaveBeenCalled();
  });
});
