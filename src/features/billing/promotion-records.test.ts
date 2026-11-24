import { describe, expect, it } from "vitest";
import {
  bothZones,
  changedFields,
  newPromotionFields,
  parsePromotionForm,
  promotionToFields,
  rowToFields,
  rowToPromotion,
  utcToWall,
  wallToUtc,
  type PromotionFields,
  type PromotionRow,
} from "./promotion-records";
import { PROMOTIONS } from "./promotions";

const asRow = (f: PromotionFields): PromotionRow => ({
  ...f,
  created_at: "2026-11-24T16:00:00Z",
  updated_at: "2026-11-24T16:00:00Z",
  updated_by: null,
});

describe("rows and the app's promotions", () => {
  it("round-trips the code defaults (what the migration seeds)", () => {
    for (const p of PROMOTIONS) {
      expect(rowToPromotion(asRow(promotionToFields(p)))).toEqual(p);
    }
  });
  it("keeps a honey tail in the bar text", () => {
    const f = promotionToFields(PROMOTIONS[0]);
    expect(f.bar_text.split("\n")[2]).toBe("Give a month, get a month: *refer a friend*");
  });
  it("has no last day when its start is empty", () => {
    const f = { ...promotionToFields(PROMOTIONS[0]), last_day_starts_at: null };
    expect(rowToPromotion(asRow(f)).lastDay).toBeNull();
  });
  it("treats an unknown audience as never-paid Owners", () => {
    const f = { ...promotionToFields(PROMOTIONS[0]), audience: "martians" };
    expect(rowToPromotion(asRow(f)).bar.audience).toBe("never_paid_owners");
  });
  it("drops the bookkeeping columns for the form", () => {
    const f = rowToFields(asRow(promotionToFields(PROMOTIONS[1])));
    expect(f).not.toHaveProperty("updated_at");
    expect(f.id).toBe("give-a-month");
  });
  it("starts a new promotion off", () => {
    expect(newPromotionFields("seasonal", "xmas-2026", "Christmas").enabled).toBe(false);
    expect(newPromotionFields("referral", "ref-2", "Ref").audience).toBe("all_owners");
  });
});

describe("US Eastern dates", () => {
  it("turns Eastern wall time into UTC (winter and summer)", () => {
    expect(wallToUtc("2026-11-30T23:59:59")?.toISOString()).toBe("2026-12-01T04:59:59.000Z");
    expect(wallToUtc("2026-07-01T12:00")?.toISOString()).toBe("2026-07-01T16:00:00.000Z");
    expect(wallToUtc("30 Nov")).toBeNull();
  });
  it("shows a UTC instant as Eastern wall time", () => {
    expect(utcToWall(new Date("2026-12-01T04:59:59Z"))).toBe("2026-11-30T23:59:59");
  });
  it("says both zones", () => {
    const s = bothZones(new Date("2026-12-01T04:59:59Z"));
    expect(s).toContain("30 Nov 2026");
    expect(s).toContain("ET");
    expect(s).toContain("04:59 UTC");
  });
});

function form(over: Record<string, string | null> = {}) {
  const base: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(promotionToFields(PROMOTIONS[0])).map(([k, v]) => [
        k,
        typeof v === "boolean" ? (v ? "on" : "") : v === null ? "" : String(v),
      ]),
    ),
    starts_at: "2026-11-20T00:00",
    ends_at: "2026-11-30T23:59:59",
    last_day_starts_at: "2026-11-30T00:00",
  };
  const all = { ...base, ...over };
  return (k: string) => all[k] ?? null;
}

describe("the edit form", () => {
  it("accepts the Black Friday promotion and stores UTC", () => {
    const r = parsePromotionForm(form());
    expect("value" in r && r.value.ends_at).toBe("2026-12-01T04:59:59.000Z");
  });
  it("leaves on/off to the switch: a stale form can't undo it", () => {
    const r = parsePromotionForm(form({ enabled: "on" }));
    expect("value" in r && "enabled" in r.value).toBe(false);
  });
  it("reads a missing switch as off", () => {
    const r = parsePromotionForm(form({ countdown: null }));
    expect("value" in r && r.value.countdown).toBe(false);
  });
  it("wants the end after the start", () => {
    expect(parsePromotionForm(form({ ends_at: "2026-11-19T00:00" }))).toEqual({
      error: "Ends: must be after it starts.",
    });
  });
  it("keeps trial days between 1 and 90", () => {
    expect(parsePromotionForm(form({ trial_days: "0" }))).toHaveProperty("error");
    expect(parsePromotionForm(form({ trial_days: "91" }))).toHaveProperty("error");
    expect(parsePromotionForm(form({ trial_days: "2.5" }))).toHaveProperty("error");
    expect(parsePromotionForm(form({ trial_days: "90" }))).toHaveProperty("value");
  });
  it("limits text lengths", () => {
    expect(parsePromotionForm(form({ headline: "x".repeat(81) }))).toEqual({
      error: "Headline: 80 characters at most.",
    });
    expect(parsePromotionForm(form({ name: "" }))).toHaveProperty("error");
  });
  it("wants a bar line when the bar is on", () => {
    expect(parsePromotionForm(form({ bar_text: "  " }))).toHaveProperty("error");
    expect(parsePromotionForm(form({ bar_text: "", bar_enabled: "" }))).toHaveProperty("value");
  });
  it("only links to the plan pop-up or an app path", () => {
    expect(parsePromotionForm(form({ bar_link: "https://evil.example" }))).toHaveProperty("error");
    expect(parsePromotionForm(form({ bar_link: "/plan#referral-title" }))).toHaveProperty("value");
  });
  it("refuses a date it can't read and a last day after the end", () => {
    expect(parsePromotionForm(form({ starts_at: "soon" }))).toHaveProperty("error");
    expect(parsePromotionForm(form({ last_day_starts_at: "2026-12-02T00:00" }))).toHaveProperty(
      "error",
    );
  });
});

describe("history", () => {
  it("lists only the fields that changed", () => {
    expect(changedFields({ a: 1, b: "x", c: null }, { a: 1, b: "y", c: null })).toEqual(["b"]);
  });
  it("compares dates as instants, so the table's format isn't a change", () => {
    expect(
      changedFields(
        { ends_at: "2026-12-02T04:59:59+00:00", starts_at: null },
        { ends_at: "2026-12-02T04:59:59.000Z", starts_at: null },
      ),
    ).toEqual([]);
    expect(
      changedFields(
        { ends_at: "2026-12-02T04:59:59+00:00" },
        { ends_at: "2026-12-03T04:59:59.000Z" },
      ),
    ).toEqual(["ends_at"]);
  });
});
