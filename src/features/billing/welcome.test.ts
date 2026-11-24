import { describe, expect, it } from "vitest";
import { PLANS } from "./plans";
import { welcomeFor } from "./welcome";

const trial = { trial: true };

describe("welcomeFor (Walter's flow, 20 Nov)", () => {
  it("Free sells Solo, auto-reply first, first month free with the price a day", () => {
    const w = welcomeFor("free", PLANS, trial);
    expect(w.title).toBe("Let Waggle answer on its own");
    expect(w.eyebrow).toBe("Solo · first month free");
    expect(w.offer?.next).toBe("solo");
    expect(w.offer?.cta).toBe("Start your free month");
    expect(w.offer?.day).toEqual({ amount: "$1.61", of: "$49 a month after your free month" });
    expect(w.perks[0].key).toBe("autoReply");
    expect(w.perks.map((p) => p.title)).toEqual([
      "Auto-reply",
      "300 AI replies a month",
      "3 accounts",
    ]);
    expect(w.now).toContain("100 AI replies");
    expect(w.team).toBeNull();
  });

  it("Free after a paid plan: no trial on offer", () => {
    const w = welcomeFor("free", PLANS, { trial: false });
    expect(w.eyebrow).toBe("Solo · $49 a month");
    expect(w.offer?.cta).toBe("Upgrade to Solo");
  });

  it("Solo sells Team: leads first, then follow-ups and the team", () => {
    const w = welcomeFor("solo");
    expect(w.title).toBe("Turn messages into sales");
    expect(w.offer?.next).toBe("business");
    expect(w.offer?.via).toBe("switch");
    expect(w.perks.map((p) => p.key)).toEqual(["leads", "followUps", "team", "room"]);
    expect(w.perks[3].title).toBe("6 accounts, 750 AI replies");
  });

  it("Team sells Business on a call, for agencies, and notes the team", () => {
    const w = welcomeFor("business");
    expect(w.title).toBe("Run socials for your clients");
    expect(w.offer?.via).toBe("call");
    expect(w.eyebrow).toBe("Business · custom price");
    expect(w.offer?.cta).toBe("Talk to us");
    expect(w.offer?.day).toBeNull();
    expect(w.perks[0].title).toBe("10+ accounts, about 1,500 AI replies");
    expect(w.team).toBe("note");
  });

  it("Business: nothing to sell; what it does, then bringing the team in", () => {
    const w = welcomeFor("team");
    expect(w.offer).toBeNull();
    expect(w.title).toBe("Everything Waggle can do");
    expect(w.perks.map((p) => p.key)).toEqual([
      "clients",
      "autoReply",
      "leads",
      "followUps",
      "room",
    ]);
    expect(w.team).toBe("main");
  });

  it("only claims more businesses or separate clients when the plan really allows more", () => {
    expect(welcomeFor("solo").perks[3].body).toContain("more than one business");
    const unlimited = structuredClone(PLANS);
    unlimited.solo.brands = null;
    expect(welcomeFor("solo", unlimited).perks[3].body).toBe("Up from 3 and 300 on Solo.");
    // Team already has unlimited businesses: Business doesn't sell "separate clients".
    expect(welcomeFor("business").perks.some((p) => p.key === "clients")).toBe(false);
  });

  it("never sells something the current plan already has", () => {
    expect(welcomeFor("solo").perks.some((p) => p.key === "autoReply")).toBe(false);
    const leadsOnSolo = structuredClone(PLANS);
    leadsOnSolo.solo.features.leadsFlagged = true;
    expect(welcomeFor("solo", leadsOnSolo).perks.some((p) => p.key === "leads")).toBe(false);
  });

  it("numbers come from the plans as staff set them", () => {
    const plans = structuredClone(PLANS);
    plans.solo.replies = 500;
    const w = welcomeFor("free", plans, trial);
    expect(w.perks[1].title).toBe("500 AI replies a month");
    expect(w.perks[1].body).toBe("5× what you have now (100), so busy weeks don’t run you out.");
  });
});
