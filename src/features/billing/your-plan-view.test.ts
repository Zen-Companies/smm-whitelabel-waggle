import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ getServiceClient: vi.fn() }));
vi.mock("./plan-actions", () => ({}));
vi.mock("./plan-forms", () => ({}));

const { priceLine, trialDay } = await import("./your-plan-view");

const trialEnd = "2026-11-24T10:00:00.000Z";

describe("priceLine", () => {
  it("Team monthly is its own price (no founding price since 24 Nov)", () => {
    expect(priceLine({ plan: "business", billing_interval: "month" })).toEqual({
      line: "$99 a month. Paid monthly · no contract.",
      chargeUsd: 99,
    });
  });
  it("yearly and plain monthly", () => {
    expect(priceLine({ plan: "solo", billing_interval: "year" }).chargeUsd).toBe(490);
    expect(priceLine({ plan: "solo", billing_interval: "month" }).line).toBe(
      "$49 a month. Paid monthly · no contract.",
    );
  });
  it("Business is a custom price: never a number", () => {
    const r = priceLine({ plan: "team", billing_interval: "month" });
    expect(r.line).toBe("Custom price, set with you on a call · no contract.");
    expect(r.line).not.toMatch(/\$/);
  });
});

describe("trialDay", () => {
  it("counts the free month's days, 1 to 30", () => {
    const end = new Date(trialEnd);
    expect(trialDay(end, new Date("2026-10-25T10:00:01Z"))).toBe(1);
    expect(trialDay(end, new Date("2026-11-20T12:00:00Z"))).toBe(27);
    expect(trialDay(end, new Date("2026-12-01T00:00:00Z"))).toBe(30);
  });
  it("a shorter trial counts to its own length", () => {
    const end = new Date(trialEnd);
    expect(trialDay(end, new Date("2026-11-17T10:00:01Z"), 7)).toBe(1);
    expect(trialDay(end, new Date("2026-11-20T12:00:00Z"), 7)).toBe(4);
  });
});
