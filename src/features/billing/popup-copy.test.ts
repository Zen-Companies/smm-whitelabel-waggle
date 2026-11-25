import { describe, expect, it } from "vitest";
import { applyPlanSettings, PLANS } from "./plans";
import {
  andList,
  NO_FACTS,
  popupContent,
  popupVersion,
  trialEndLabel,
  type PopupFacts,
  type PopupVersion,
  type Seg,
} from "./popup-copy";

const NOW = new Date("2026-11-23T12:00:00Z");
const text = (segs: Seg[] | null) => (segs ? segs.map((s) => s.text).join("") : null);
const content = (version: PopupVersion, facts: Partial<PopupFacts> = {}, trial = true) =>
  popupContent({ version, plans: PLANS, trial, facts: { ...NO_FACTS, ...facts }, now: NOW });

const scan = (o: Partial<NonNullable<PopupFacts["scan"]>> = {}) => ({
  platform: "instagram",
  buyers: 0,
  lockedDms: 0,
  answeredDms: 0,
  answeredComments: 0,
  ...o,
});

describe("popupVersion", () => {
  it("maps each reason to its version", () => {
    expect(popupVersion("accounts", { platform: "tiktok" })).toEqual({
      v: "accounts",
      platform: "tiktok",
    });
    expect(popupVersion("accounts", { platforms: "instagram,tiktok" })).toEqual({
      v: "accounts_pick",
      picked: ["instagram", "tiktok"],
    });
    expect(popupVersion("auto_reply", { topic: "faq" })).toEqual({ v: "worker_bee", topic: "faq" });
    expect(popupVersion("auto_reply", { topic: "nope" })).toEqual({ v: "worker_bee", topic: null });
    expect(popupVersion("out")).toEqual({ v: "replies", level: "out" });
    expect(popupVersion("replies", {}, "low")).toEqual({ v: "replies", level: "low" });
    expect(popupVersion("idle", { platform: "facebook" })).toEqual({
      v: "idle",
      platform: "facebook",
    });
    expect(popupVersion("team")).toEqual({ v: "team", sub: "invite" });
    expect(popupVersion("brands")).toEqual({ v: "team", sub: "brands" });
    expect(popupVersion("nudge")).toEqual({ v: "try", sub: "banner" });
    expect(popupVersion("welcome")).toEqual({ v: "try", sub: "welcome" });
  });

  it("ignores a platform that isn't an id", () => {
    expect(popupVersion("accounts", { platform: "<script>" })).toEqual({
      v: "accounts",
      platform: null,
    });
  });
});

describe("popupContent", () => {
  it("A: names the platform, with the brand's buyers and the plan's numbers", () => {
    const c = content(
      { v: "accounts", platform: "tiktok" },
      { connected: ["instagram"], scan: scan({ buyers: 13 }) },
    );
    expect(c.headline).toBe("Add TikTok with Solo");
    expect(c.sub).toBe("Free covers 1 account. Solo covers 3.");
    expect(c.strip.map((b) => `${b.title}/${b.text}`)).toEqual([
      "Instagram/Connected",
      "TikTok/Adding now",
      "+ 1 more/open",
    ]);
    expect(text(c.honey)).toBe(
      "13 people wanted to buy on your Instagram and got no answer. Don’t let TikTok do the same.",
    );
    expect(c.ticks.map((t) => `${t.bold} · ${t.rest}`)).toEqual([
      "3 accounts · you use 1 now",
      "Worker Bee · answers regular questions for you, day or night, once you trust it",
      "About 300 replies a month · Free has 100",
    ]);
    expect(c.note).toBe(
      "Add a card, pay $0 today. Then $49 a month from December 23. Cancel before then and you pay nothing.",
    );
    expect(c.reminder).toBe("We email you 3 days before the first charge.");
    expect(c.success).toBe("You’re on Solo. Free until December 23.");
    expect(c.keep.label).toBe("Keep Free");
  });

  it("A: no buyers (or no scan) drops the honey box; unknown platform says up to N", () => {
    const c = content({ v: "accounts", platform: null }, { scan: scan({ buyers: 0 }) });
    expect(c.honey).toBeNull();
    expect(c.headline).toBe("Connect up to 3 accounts with Solo");
  });

  it("A: numbers follow Staff → Plans", () => {
    const plans = applyPlanSettings([
      {
        plan: "solo",
        brands_limit: 1,
        accounts: 5,
        replies: 400,
        team: null,
        auto_reply: null,
        leads_flagged: null,
        follow_ups: null,
        for_sale: null,
      },
    ]);
    const c = popupContent({
      version: { v: "accounts", platform: "tiktok" },
      plans,
      trial: true,
      facts: NO_FACTS,
      now: NOW,
    });
    expect(c.sub).toBe("Free covers 1 account. Solo covers 5.");
    expect(c.ticks[2]!.bold).toBe("About 400 replies a month");
  });

  it("A, setup step 1: both platforms named, Keep one", () => {
    const c = content({ v: "accounts_pick", picked: ["instagram", "tiktok"] });
    expect(c.headline).toBe("Connect Instagram and TikTok with Solo");
    expect(c.strip[0]).toMatchObject({ title: "Instagram", text: "Picked" });
    expect(c.keep.label).toBe("Keep one");
  });

  it("B: locked DMs in the honey box, Ask me first for now", () => {
    const c = content({ v: "worker_bee", topic: null }, { scan: scan({ lockedDms: 37 }) });
    expect(c.headline).toBe("Turn on Worker Bee with Solo");
    expect(text(c.honey)).toBe(
      "37 DMs on your Instagram went past Meta’s 24-hour window with no reply. Worker Bee answers inside it, day or night.",
    );
    expect(c.keep.label).toBe("Ask me first for now");
  });

  it("B, one kind of message: waiting count", () => {
    const c = content({ v: "worker_bee", topic: "faq" }, { pain: { perDay: 0, waiting: 8 } });
    expect(c.headline).toBe("Let Worker Bee answer questions");
    expect(text(c.honey)).toBe("8 messages are waiting for your OK right now.");
  });

  it("C out: no ×, Answer them myself, numbers from usage", () => {
    const c = content(
      { v: "replies", level: "out" },
      {
        pain: { perDay: 2, waiting: 8 },
        usage: { used: 100, allowance: 100, resetsOn: "Dec 1" },
      },
    );
    expect(c.closable).toBe(false);
    expect(c.keep).toEqual({ label: "Answer them myself", kind: "inbox" });
    expect(c.strip.map((b) => `${b.title}/${b.text}`)).toEqual([
      "100 of 100/used",
      "300/on Solo",
      "Resets/Dec 1",
    ]);
    expect(text(c.honey)).toBe(
      "~2 messages a day from customers. 8 are waiting for a reply right now.",
    );
  });

  it("C low: days left at this pace", () => {
    const c = content(
      { v: "replies", level: "low" },
      { pain: { perDay: 2, waiting: 0 }, usage: { used: 82, allowance: 100, resetsOn: "Dec 1" } },
    );
    expect(c.headline).toBe("Get about 300 replies a month with Solo");
    expect(c.sub).toBe("You’ve used 82 of your 100 Free replies this month.");
    expect(text(c.honey)).toBe(
      "~2 messages a day from customers. At that pace you run out in about 9 days.",
    );
    expect(c.closable).toBe(true);
  });

  it("D: reconnect the platform, no honey box", () => {
    const c = content({ v: "idle", platform: "instagram" });
    expect(c.headline).toBe("Reconnect Instagram with Solo");
    expect(c.honey).toBeNull();
  });

  it("E: Team at its confirmed price and numbers, from the plans", () => {
    const c = content({ v: "team", sub: "invite" });
    expect(c.plan).toBe("business");
    expect(c.headline).toBe("Invite your team with Team");
    expect(c).not.toHaveProperty("priceFlag");
    expect(c.note).toBe(
      "Add a card, pay $0 today. Then $99 a month from December 23. Cancel before then and you pay nothing.",
    );
    expect(c.ticks[1]!.bold).toBe(`${PLANS.business.accounts} accounts`);
    expect(c.ticks[2]!.bold).toBe(`Worker Bee and ${PLANS.business.replies} replies a month`);
    expect(content({ v: "team", sub: "brands" }, { brandName: "Sunny Side" }).strip[0]!.title).toBe(
      "Sunny Side",
    );
    // Staff → Plans changes flow through.
    const staffSet = popupContent({
      version: { v: "team", sub: "invite" },
      plans: { ...PLANS, business: { ...PLANS.business, monthlyUsd: 109, accounts: 5 } },
      trial: true,
      facts: NO_FACTS,
      now: NOW,
    });
    expect(staffSet.note).toContain("Then $109 a month");
    expect(staffSet.ticks[1]!.bold).toBe("5 accounts");
  });

  it("E: Team at its own price, no founding offer (retired 24 Nov)", () => {
    const team = (trial: boolean) =>
      popupContent({
        version: { v: "team", sub: "leads" },
        plans: PLANS,
        trial,
        facts: NO_FACTS,
        now: NOW,
      });
    expect(team(true).note).toBe(
      "Add a card, pay $0 today. Then $99 a month from December 23. Cancel before then and you pay nothing.",
    );
    expect(team(false).note).toContain("Pay $99 today");
    expect(team(true).note).not.toMatch(/founding|\$79/i);
  });

  it("F welcome: what was answered and what Meta locked", () => {
    const c = content(
      { v: "try", sub: "welcome" },
      { scan: scan({ answeredDms: 4, answeredComments: 23, lockedDms: 37 }) },
    );
    expect(text(c.honey)).toBe(
      "You answered the 4 DMs and 23 comments you could. 37 DMs were already locked by Meta. Worker Bee keeps that from happening again.",
    );
    expect(c.strip[1]).toMatchObject({ title: "27 replies", text: "sent" });
  });

  it("F banner without a trial: pay words change", () => {
    const c = content({ v: "try", sub: "banner" }, {}, false);
    expect(c.headline).toBe("Let Worker Bee answer with Solo");
    expect(c.cardLabel).toBe("Pay with a card");
    expect(c.success).toBe("You’re on Solo.");
    expect(c.reminder).toBeNull();
  });

  it("F banner with the trial (Walter's playbook, 25 Nov): first month free, Worker Bee", () => {
    const c = content({ v: "try", sub: "banner" });
    expect(c.headline).toBe("Try Solo. Your first month is free.");
    expect(c.sub).toBe(
      "Worker Bee answers regular questions for you, day or night, once you trust it.",
    );
    expect(c.strip[1]).toMatchObject({ title: "Worker Bee", text: "First month free" });
    expect(c.reminder).toBe("We email you 3 days before the first charge.");
    expect(c.ticks[2]!.bold).toBe("About 300 replies a month");
    expect(c.ticks[1]!.bold).toBe("Worker Bee");
  });

  it("F banner with a longer promotion or a friend's link: the days, never 30", () => {
    const c = popupContent({
      version: { v: "try", sub: "banner" },
      plans: PLANS,
      trial: true,
      trialDays: 60,
      facts: NO_FACTS,
      now: NOW,
    });
    expect(c.headline).toBe("Try Solo. 60 days free.");
    expect(c.strip[1]).toMatchObject({ text: "60 days free" });
    expect(c.headline).not.toMatch(/30/);
  });

  it("the Solo offer never says every message, 7 days or Free forever", () => {
    const versions: PopupVersion[] = [
      { v: "accounts", platform: "tiktok" },
      { v: "worker_bee", topic: null },
      { v: "replies", level: "out" },
      { v: "replies", level: "low" },
      { v: "idle", platform: "instagram" },
      { v: "try", sub: "banner" },
      { v: "try", sub: "welcome" },
    ];
    for (const v of versions) {
      const all = JSON.stringify(content(v));
      expect(all).not.toMatch(/every message|7 days|free forever/i);
    }
  });
});

describe("helpers", () => {
  it("andList and trialEndLabel", () => {
    expect(andList(["A"])).toBe("A");
    expect(andList(["A", "B", "C"])).toBe("A, B and C");
    // The first month free (24 Nov): 30 days from now.
    expect(trialEndLabel(NOW)).toBe("December 23");
  });
});

describe("the strip's account box (QA, 25 Nov)", () => {
  it("says Not connected when nothing is connected, never Connected", () => {
    for (const v of [
      { v: "try", sub: "banner" },
      { v: "try", sub: "welcome" },
      { v: "accounts", platform: "tiktok" },
    ] as PopupVersion[]) {
      const box = content(v, { connected: [] }).strip[0];
      expect(box).toMatchObject({ title: "+ add", text: "Not connected", tone: "open" });
    }
  });
  it("names the account when one is connected", () => {
    expect(
      content({ v: "try", sub: "banner" }, { connected: ["instagram"] }).strip[0],
    ).toMatchObject({ text: "Connected", tone: "done", platform: "instagram" });
  });
});
