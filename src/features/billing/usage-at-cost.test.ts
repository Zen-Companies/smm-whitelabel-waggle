import { describe, expect, it } from "vitest";
import { usageLineText, usageParts, usageWindow } from "./usage-at-cost";

describe("usage at cost (18 Nov)", () => {
  it("passes through pay-per-use only, never accounts, credits or the total", () => {
    const r = usageParts({ accounts: 6, xApi: 3.4, sms: 1.1, credits: -12, total: -1.5 });
    expect(r).toEqual({
      cents: 450,
      parts: [
        { label: "X", cents: 340 },
        { label: "Texts", cents: 110 },
      ],
    });
  });

  it("rounds to cents and leaves out less than a cent and refunds", () => {
    expect(usageParts({ xApi: 0.004, sms: -2, calls: 0.125 })).toEqual({
      cents: 13,
      parts: [{ label: "Calls", cents: 13 }],
    });
    expect(usageParts({}).cents).toBe(0);
  });

  it("unknown families are charged as Other, merged into one line", () => {
    expect(usageParts({ something: 1, newThing: 2 }).parts).toEqual([
      { label: "Other", cents: 300 },
    ]);
  });

  it("writes the invoice line", () => {
    const text = usageLineText(
      "Harbour Bean Café",
      new Date("2026-11-12T00:00:00Z"),
      new Date("2026-12-11T00:00:00Z"),
      [
        { label: "X", cents: 340 },
        { label: "Texts", cents: 110 },
      ],
    );
    expect(text).toBe("Usage at cost, Harbour Bean Café, Nov 12 – Dec 11: X $3.40, texts $1.10");
  });

  it("asks Zernio for the period's days, end excluded", () => {
    expect(usageWindow(new Date("2026-11-12T08:00:00Z"), new Date("2026-12-12T08:00:00Z"))).toEqual(
      { from: "2026-11-12", to: "2026-12-12" },
    );
    expect(usageWindow(new Date("2026-11-12T00:00:00Z"), new Date("2026-12-12T00:00:00Z"))).toEqual(
      { from: "2026-11-12", to: "2026-12-11" },
    );
  });
});
