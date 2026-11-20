import { describe, expect, it } from "vitest";
import { PLANS } from "./plans";
import { UPGRADE_REASONS } from "./upgrade";
import { nextPlan, offeredPlan, outLine, upgradeOffer } from "./upgrade-offer";

const trial = { trial: true };

describe("the ladder", () => {
  it("climbs Free → Solo → Team → Business, and stops at Business", () => {
    expect(nextPlan("free")).toBe("solo");
    expect(nextPlan("solo")).toBe("business"); // shown as Team
    expect(nextPlan("business")).toBe("team"); // shown as Business
    expect(nextPlan("team")).toBeNull();
  });

  it("skips ahead when the limit needs a higher plan", () => {
    expect(offeredPlan("free", "team")).toBe("business");
    expect(offeredPlan("free", "auto_reply")).toBe("solo");
    expect(offeredPlan("free", "out")).toBe("solo");
    expect(offeredPlan("solo", "brands")).toBe("business");
  });
});

describe("upgradeOffer", () => {
  it("Free: Solo with 7 days free and a card, no extras", () => {
    const o = upgradeOffer("free", "accounts", PLANS, trial);
    expect(o.next).toBe("solo");
    expect(o.via).toBe("trial");
    expect(o.cta).toBe("Start 7 days free");
    expect(o.title).toBe("Free includes 1 account.");
    expect(o.body).toBe("Upgrade to Solo to connect 3.");
    expect(o.extra).toBeNull();
    expect(o.day).toEqual({ amount: "$1.61", of: "$49 a month after 7 days free" });
    expect(o.footnote).toContain("A card starts your trial");
  });

  it("Free again after a paid plan: no second trial, paid at checkout", () => {
    const o = upgradeOffer("free", "auto_reply", PLANS, { trial: false });
    expect(o.via).toBe("checkout");
    expect(o.cta).toBe("Upgrade to Solo");
    expect(o.day).toEqual({ amount: "$1.61", of: "$49 a month" });
  });

  it("Free asking for a team feature is offered Team, with the trial", () => {
    const o = upgradeOffer("free", "team", PLANS, trial);
    expect(o.next).toBe("business");
    expect(o.via).toBe("trial");
    expect(o.title).toBe("Inviting your team is on Team.");
  });

  it("Solo at its accounts: an extra account, or Team in place", () => {
    const o = upgradeOffer("solo", "accounts");
    expect(o.title).toBe("Solo includes 3 accounts.");
    expect(o.next).toBe("business");
    expect(o.via).toBe("switch");
    expect(o.cta).toBe("Switch to Team");
    expect(o.extra).toBe("account");
    expect(o.body).toBe("Add one more for $10 a month. Team has 6.");
  });

  it("Team: Business is a call (Book a call, no price), with extras still offered", () => {
    const o = upgradeOffer("business", "replies");
    expect(o.next).toBe("team");
    expect(o.via).toBe("call");
    expect(o.cta).toBe("Book a call");
    expect(o.extra).toBe("topUp");
    expect(o.day).toBeNull();
  });

  it("Business: no plan above, only extras", () => {
    const o = upgradeOffer("team", "accounts");
    expect(o.next).toBeNull();
    expect(o.via).toBeNull();
    expect(o.extra).toBe("account");
    expect(o.title).toBe("Business includes 10 accounts.");
  });

  it("out of replies says it honestly, with the reset date (decision 9)", () => {
    const free = upgradeOffer("free", "out", PLANS, { trial: true, resetsOn: "December 1" });
    expect(free.body).toBe(
      "Waggle has stopped writing replies until December 1. New messages still arrive in your Inbox, and you can answer them yourself. Solo has 300 a month.",
    );
    expect(free.body).not.toMatch(/aren.t being answered/);
    expect(free.extra).toBeNull();
    expect(upgradeOffer("solo", "out").extra).toBe("topUp");
    expect(outLine(undefined)).toContain("for this month");
  });

  it("never offers top-ups or extra accounts on Free", () => {
    for (const r of [...UPGRADE_REASONS, "out", "nudge"] as const) {
      expect(upgradeOffer("free", r, PLANS, trial).extra).toBeNull();
    }
  });

  it("numbers come from the plans as staff set them, never typed in", () => {
    const plans = structuredClone(PLANS);
    plans.solo.replies = 400;
    plans.solo.accounts = 5;
    expect(upgradeOffer("free", "accounts", plans, trial).body).toBe(
      "Upgrade to Solo to connect 5.",
    );
    expect(upgradeOffer("free", "nudge", plans, trial).body).toContain("400 AI replies");
  });

  it("a team feature the plan already has: nothing to sell", () => {
    const o = upgradeOffer("business", "team");
    expect(o.title).toBe("You’re on Team");
    expect(o.next).toBeNull();
    expect(o.cta).toBeNull();
  });
});
