import { describe, expect, it } from "vitest";
import {
  activeBar,
  audienceIncludes,
  barHiddenToday,
  barHiddenValue,
  barTextOf,
  dayKey,
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
const lastDay = new Date("2026-12-01T15:00:00Z");
const after = new Date("2026-12-02T05:00:00Z");
const nextYear = new Date("2027-03-01T15:00:00Z");
/** Staff set an end date on Staff → Promotions (it only switches the offer off). */
const END = new Date("2026-12-02T04:59:59Z");
const withEnds: Promotion[] = PROMOTIONS.map((p) => ({ ...p, endsAt: END }));
/** Black Friday over (switched off), the referral program still running. */
const referralOpen: Promotion[] = PROMOTIONS.map((p) =>
  p.kind === "seasonal" ? { ...p, endsAt: END } : p,
);
const DATE_WORDS =
  /\b(ends?|tonight|tomorrow|last day|by (mon|tue|wed|thu|fri|sat|sun)|nov|dec|\d{1,2}:\d{2})\b/i;

const neverPaidOwner = { isOwner: true, neverPaid: true, paying: false };
const paidOwner = { isOwner: true, neverPaid: false, paying: true };
/** Had a plan once, back on Free now. */
const lapsedOwner = { isOwner: true, neverPaid: false, paying: false };
const member = { isOwner: false, neverPaid: true, paying: false };

describe("days (the bar's × for the day)", () => {
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
  it("never states an end date: no date, countdown or last-day words (Pricing Bible, 24 Nov)", () => {
    for (const now of [tuesday, lastDay, nextYear]) {
      const bar = activeBar(now, neverPaidOwner);
      expect(bar?.copy.label).toBe("Black Friday");
      for (const l of [...bar!.copy.lines, ...bar!.copy.phoneLines]) {
        expect(`${l.text}${l.honey ?? ""}`).not.toMatch(DATE_WORDS);
      }
    }
    expect(activeBar(tuesday, neverPaidOwner)?.copy.lines[0]?.text).toBe(
      "Your first month is free on Solo and Team",
    );
  });
  it("an end date set by staff only switches it off, and is never said", () => {
    expect(activeBar(lastDay, neverPaidOwner, withEnds)?.copy.label).toBe("Black Friday");
    expect(activeBar(after, neverPaidOwner, withEnds)).toBeNull();
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
  it("the referral bar is for paying Owners only (only they can refer)", () => {
    const referral = PROMOTIONS.find((p) => p.kind === "referral")!;
    expect(referral.bar.audience).toBe("paying_owners");
    expect(audienceIncludes("paying_owners", paidOwner)).toBe(true);
    expect(audienceIncludes("paying_owners", neverPaidOwner)).toBe(false);
    expect(audienceIncludes("paying_owners", lapsedOwner)).toBe(false);
    expect(audienceIncludes("paying_owners", { ...paidOwner, isOwner: false })).toBe(false);
    const list: Promotion[] = referralOpen.map((p) =>
      p.kind === "referral" ? { ...p, bar: { ...p.bar, enabled: true } } : p,
    );
    expect(activeBar(after, paidOwner, list)?.promotionId).toBe("give-a-month");
    expect(activeBar(after, neverPaidOwner, list)).toBeNull();
    expect(activeBar(after, lapsedOwner, list)).toBeNull();
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
  it("Black Friday with no date or countdown, even on its last day", () => {
    const bf = passFor({ now: tuesday, referred: false, referrerName: null });
    expect(bf?.dayName).toEqual(["Black", "Friday"]);
    expect(bf?.small).toBe(
      "Black Friday: your first month is free on Solo and Team. Card today, $0 for 30 days, and we email you before the first charge.",
    );
    expect(bf).not.toHaveProperty("chip");
    const last = passFor(
      { now: lastDay, referred: true, referrerName: "Harbour Bean Café" },
      withEnds,
    );
    expect(last?.dayName).toEqual(["Black", "Friday"]);
    expect(`${last?.headline} ${last?.small}`).not.toMatch(DATE_WORDS);
  });
  it("after Black Friday: the friend's month, only when referred", () => {
    const friend = passFor(
      { now: after, referred: true, referrerName: "Harbour Bean Café" },
      referralOpen,
    );
    expect(friend?.kind).toBe("referral");
    expect(friend?.small).toBe("Harbour Bean Café sent you. It’s on Solo or Team, no code needed.");
    expect(passFor({ now: after, referred: false, referrerName: null }, referralOpen)).toBeNull();
    // Both ended (staff set end dates): no pass.
    expect(passFor({ now: after, referred: true, referrerName: "X" }, withEnds)).toBeNull();
  });
  it("keeps the friend's month for a friend who joined while the program ran", () => {
    const pass = passFor(
      { now: after, referred: true, referredAt: tuesday, referrerName: "X" },
      PROMOTIONS.map((p) =>
        p.kind === "seasonal" ? { ...p, enabled: false } : { ...p, endsAt: END },
      ),
    );
    expect(pass?.kind).toBe("referral");
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
  it("reads the running referral program, not the first one listed", () => {
    const list: Promotion[] = [
      { ...PROMOTIONS[1], id: "old-referral", enabled: false },
      ...PROMOTIONS,
    ];
    expect(inviteState({ known: true, name: "X", now: tuesday }, list).kind).toBe("invite");
    const off = PROMOTIONS.map((p) => (p.kind === "referral" ? { ...p, enabled: false } : p));
    expect(inviteState({ known: true, name: "X", now: tuesday }, off).kind).toBe("ended");
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
