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

const { createPromotion, setPromotionEnabled, updatePromotion } =
  await import("./promotion-actions");

function fd(values: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}

beforeEach(() => {
  hasPermission.mockReset();
  from.mockReset();
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
