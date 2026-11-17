import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ getServiceClient: vi.fn() }));
vi.mock("./plan-actions", () => ({}));
vi.mock("./plan-forms", () => ({}));

const { priceLine, trialDay } = await import("./your-plan-view");

const trialEnd = "2026-11-24T10:00:00.000Z";

describe("priceLine", () => {
  it("founding Business: $79 until 6 months from the start, then $99", () => {
    const r = priceLine(
      { plan: "business", billing_interval: "month", founding: true, trial_ends_at: trialEnd },
      new Date("2026-11-18T00:00:00Z"),
    );
    expect(r.chargeUsd).toBe(79);
    expect(r.founding).toBe(true);
    expect(r.line).toBe("$79 a month until May 17, then $99. Paid monthly · no contract.");
  });
  it("after the 6 months it's the plan price", () => {
    const r = priceLine(
      { plan: "business", billing_interval: "month", founding: true, trial_ends_at: trialEnd },
      new Date("2027-06-01T00:00:00Z"),
    );
    expect(r).toEqual({
      line: "$99 a month. Paid monthly · no contract.",
      chargeUsd: 99,
      founding: false,
    });
  });
  it("yearly and plain monthly", () => {
    expect(
      priceLine({ plan: "solo", billing_interval: "year", founding: false, trial_ends_at: null })
        .chargeUsd,
    ).toBe(490);
    expect(
      priceLine({ plan: "solo", billing_interval: "month", founding: false, trial_ends_at: null })
        .line,
    ).toBe("$49 a month. Paid monthly · no contract.");
  });
});

describe("trialDay", () => {
  it("counts days 1 to 7", () => {
    const end = new Date(trialEnd);
    expect(trialDay(end, new Date("2026-11-17T10:00:01Z"))).toBe(1);
    expect(trialDay(end, new Date("2026-11-20T12:00:00Z"))).toBe(4);
    expect(trialDay(end, new Date("2026-12-01T00:00:00Z"))).toBe(7);
  });
});
