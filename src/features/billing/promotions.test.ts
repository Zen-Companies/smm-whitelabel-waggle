import { describe, expect, it } from "vitest";
import {
  activeBar,
  audienceIncludes,
  barHiddenToday,
  barHiddenValue,
  barTextOf,
  dayKey,
  daysLeft,
  endsInLabel,
  inviteState,
  parseBarText,
  passFor,
  PROMOTIONS,
  promotionStatus,
  splitLastWord,
  successLines,
  type Promotion,
} from "./promotions";

const tuesday = new Date("2026-11-24T15:00:00Z");
const sunday = new Date("2026-11-29T15:00:00Z");
const cyberMonday = new Date("2026-11-30T15:00:00Z");
// Extended to Tuesday 1 Dec, 11:59 pm ET (Walter's GHL campaign, 24 Nov).
const lastDay = new Date("2026-12-01T15:00:00Z");
const lastMinute = new Date("2026-12-02T04:59:00Z");
const after = new Date("2026-12-02T05:00:00Z");
/** The referral program kept running after Black Friday (its end is editable). */
const referralOpen: Promotion[] = PROMOTIONS.map((p) =>
  p.kind === "referral" ? { ...p, endsAt: null } : p,
);

const neverPaidOwner = { isOwner: true, neverPaid: true };
const paidOwner = { isOwner: true, neverPaid: false };
const member = { isOwner: false, neverPaid: true };

describe("days left (US Eastern)", () => {
  it("counts calendar days to Monday 30 Nov", () => {
    expect(daysLeft(tuesday, new Date("2026-12-01T04:59:59Z"))).toBe(6);
    expect(endsInLabel(tuesday, new Date("2026-12-01T04:59:59Z"))).toBe("Ends in 6 days");
    expect(endsInLabel(sunday, new Date("2026-12-01T04:59:59Z"))).toBe("Ends tomorrow");
    expect(endsInLabel(cyberMonday, new Date("2026-12-01T04:59:59Z"))).toBe("Ends tonight");
    expect(endsInLabel(lastMinute, new Date("2026-12-01T04:59:59Z"))).toBe("Ends tonight");
  });
  it("days are the viewer's zone's days", () => {
    expect(dayKey(new Date("2026-11-24T20:00:00Z"), "Asia/Manila")).toBe("2026-11-25");
    expect(dayKey(new Date("2026-11-24T20:00:00Z"), "America/New_York")).toBe("2026-11-24");
    expect(dayKey(new Date("2026-11-24T20:00:00Z"), "Not/AZone")).toBe("2026-11-24");
  });
});

describe("the bar", () => {
  it("shows Black Friday to Owners of never-paid organizations only", () => {
    expect(activeBar(tuesday, neverPaidOwner)?.copy.label).toBe("Black Friday");
    expect(activeBar(tuesday, paidOwner)).toBeNull();
    expect(activeBar(tuesday, member)).toBeNull();
  });
  it("says Last day on Tuesday 1 Dec and goes after 11:59 pm ET", () => {
    expect(activeBar(cyberMonday, neverPaidOwner)?.copy.label).toBe("Black Friday");
    expect(activeBar(lastDay, neverPaidOwner)?.copy.label).toBe("Last day");
    expect(activeBar(lastMinute, neverPaidOwner)).not.toBeNull();
    expect(activeBar(after, neverPaidOwner)).toBeNull();
  });
  it("each promotion's bar has its own switch and audience", () => {
    const list: Promotion[] = referralOpen.map((p) =>
      p.kind === "referral"
        ? { ...p, bar: { ...p.bar, enabled: true, audience: "all_owners" } }
        : p,
    );
    expect(activeBar(after, paidOwner, list)?.promotionId).toBe("give-a-month");
    expect(activeBar(after, member, list)).toBeNull();
    expect(activeBar(tuesday, neverPaidOwner, list)?.promotionId).toBe("black-friday-2026");
  });
  it("audiences", () => {
    expect(audienceIncludes("everyone", member)).toBe(true);
    expect(audienceIncludes("all_owners", paidOwner)).toBe(true);
    expect(audienceIncludes("never_paid_owners", paidOwner)).toBe(false);
  });
});

describe("hiding the bar for the day", () => {
  it("stays hidden the rest of that day, then shows again", () => {
    const v = barHiddenValue("black-friday-2026", tuesday, "America/New_York");
    expect(barHiddenToday(v, "black-friday-2026", tuesday, "America/New_York")).toBe(true);
    expect(
      barHiddenToday(v, "black-friday-2026", new Date("2026-11-25T15:00:00Z"), "America/New_York"),
    ).toBe(false);
  });
  it("is per promotion, and nothing hides without the cookie", () => {
    const v = barHiddenValue("black-friday-2026", tuesday, "UTC");
    expect(barHiddenToday(v, "give-a-month", tuesday, "UTC")).toBe(false);
    expect(barHiddenToday(undefined, "black-friday-2026", tuesday, "UTC")).toBe(false);
  });
});

describe("the pass on Your plan", () => {
  it("Black Friday with the countdown, then the last day", () => {
    const bf = passFor({ now: tuesday, referred: false, referrerName: null });
    expect(bf?.dayName).toEqual(["Black", "Friday"]);
    expect(bf?.chip).toBe("Ends in 7 days");
    const last = passFor({ now: lastDay, referred: true, referrerName: "Harbour Bean Café" });
    expect(last?.dayName).toEqual(["Last", "Day"]);
    expect(last?.chip).toBe("Ends tonight");
  });
  it("after Black Friday: the friend's month, only when referred", () => {
    const friend = passFor(
      { now: after, referred: true, referrerName: "Harbour Bean Café" },
      referralOpen,
    );
    expect(friend?.kind).toBe("referral");
    expect(friend?.small).toContain("Harbour Bean Café sent you.");
    expect(friend?.chip).toBeNull();
    expect(passFor({ now: after, referred: false, referrerName: null }, referralOpen)).toBeNull();
    // The campaign's default: the friend's month ends with Black Friday (Tue 1 Dec).
    expect(passFor({ now: after, referred: true, referrerName: "X" })).toBeNull();
  });
  it("splits the honey word", () => {
    expect(splitLastWord("Your first month is free.")).toEqual(["Your first month is ", "free."]);
  });
});

describe("the invite card", () => {
  it("unknown code: no card", () => {
    expect(inviteState({ known: false, name: null, now: tuesday })).toEqual({ kind: "none" });
  });
  it("names the business, or a friend", () => {
    expect(inviteState({ known: true, name: "Harbour Bean Café", now: tuesday })).toEqual({
      kind: "invite",
      name: "Harbour Bean Café",
    });
    expect(inviteState({ known: true, name: "  ", now: tuesday })).toEqual({
      kind: "invite",
      name: null,
    });
  });
  it("ended program", () => {
    const list: Promotion[] = PROMOTIONS.map((p) =>
      p.kind === "referral" ? { ...p, endsAt: new Date("2026-11-01T00:00:00Z") } : p,
    );
    expect(inviteState({ known: true, name: "X", now: tuesday }, list).kind).toBe("ended");
  });
});

describe("success lines", () => {
  it("the friend's month and banked months", () => {
    expect(successLines({ promo: "black_friday", bankedMonths: 0, referrerName: null })).toEqual(
      [],
    );
    expect(successLines({ promo: "referral", bankedMonths: 0, referrerName: "Harbour" })[0]).toBe(
      "Harbour’s month is on. They get a month free too once your first payment goes through.",
    );
    expect(successLines({ promo: "banked", bankedMonths: 1, referrerName: null })).toEqual([
      "+1 month from friends you brought. Included in the date above.",
    ]);
  });
});

describe("status on Staff → Promotions", () => {
  const p = {
    enabled: true,
    startsAt: new Date("2026-11-20T05:00:00Z"),
    endsAt: new Date("2026-12-01T04:59:59Z"),
  };
  it("is Running, Scheduled, Ended or Off", () => {
    expect(promotionStatus(p, new Date("2026-11-25T00:00:00Z"))).toBe("running");
    expect(promotionStatus(p, new Date("2026-11-19T00:00:00Z"))).toBe("scheduled");
    expect(promotionStatus(p, new Date("2026-12-01T05:00:00Z"))).toBe("ended");
    expect(promotionStatus({ ...p, enabled: false }, new Date("2026-11-25T00:00:00Z"))).toBe("off");
  });
  it("runs with open dates", () => {
    expect(promotionStatus({ enabled: true, startsAt: null, endsAt: null }, new Date())).toBe(
      "running",
    );
  });
});

describe("bar text", () => {
  it("reads one line each, with a honey tail in stars", () => {
    expect(parseBarText("First month free\n\n  Refer: *a friend*  \r\nEnds Mon")).toEqual([
      { text: "First month free" },
      { text: "Refer: ", honey: "a friend" },
      { text: "Ends Mon" },
    ]);
  });
  it("writes back what it read", () => {
    const text = "Refer: *a friend*\nEnds Mon";
    expect(barTextOf(parseBarText(text))).toBe(text);
  });
});
