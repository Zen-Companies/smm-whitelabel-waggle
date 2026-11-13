import { describe, expect, it } from "vitest";
import { cpcRuleBody, money, parseBoostForm, toBoostBody } from "./boost";

const form = (v: Record<string, string>) => {
  const f = new FormData();
  for (const [k, val] of Object.entries(v)) f.set(k, val);
  return f;
};
const base = {
  post: "zp_1|facebook",
  adAccountId: "act_1",
  goal: "reach",
  country: "PH",
  ageMin: "18",
  ageMax: "45",
  daily: "300",
  days: "3",
};

describe("parseBoostForm", () => {
  it("reads a reach boost and totals it", () => {
    const r = parseBoostForm(form(base), { minDailyBudget: 50 });
    expect(r).toEqual({
      ok: true,
      value: {
        postId: "zp_1",
        postPlatform: "facebook",
        adAccountId: "act_1",
        goal: "reach",
        linkUrl: null,
        leadFormId: null,
        country: "PH",
        ageMin: 18,
        ageMax: 45,
        daily: 300,
        days: 3,
      },
    });
  });

  it("needs a link for visits, a form for leads, and a budget above the minimum", () => {
    expect(parseBoostForm(form({ ...base, goal: "visits" }), { minDailyBudget: 50 })).toMatchObject(
      {
        ok: false,
        field: "linkUrl",
      },
    );
    expect(parseBoostForm(form({ ...base, goal: "leads" }), { minDailyBudget: 50 })).toMatchObject({
      ok: false,
      field: "leadFormId",
    });
    expect(parseBoostForm(form({ ...base, daily: "20" }), { minDailyBudget: 50 })).toMatchObject({
      ok: false,
      field: "daily",
    });
    expect(
      parseBoostForm(form({ ...base, ageMin: "50", ageMax: "30" }), { minDailyBudget: 1 }),
    ).toMatchObject({
      ok: false,
      field: "age",
    });
    expect(parseBoostForm(form({ ...base, days: "45" }), { minDailyBudget: 1 })).toMatchObject({
      ok: false,
      field: "days",
    });
  });
});

describe("toBoostBody", () => {
  const now = new Date("2026-11-13T02:00:00.000Z");
  const value = (over: Partial<Parameters<typeof toBoostBody>[0]>) => ({
    postId: "zp_1",
    postPlatform: "facebook" as const,
    adAccountId: "act_1",
    goal: "reach" as const,
    linkUrl: null,
    leadFormId: null,
    country: "PH",
    ageMin: 18,
    ageMax: 45,
    daily: 300,
    days: 3,
    ...over,
  });

  it("reach: awareness, a daily budget, the days from now", () => {
    expect(toBoostBody(value({}), { connectionId: "c_1", name: "Boost: Ube", now })).toEqual({
      postId: "zp_1",
      accountId: "c_1",
      adAccountId: "act_1",
      name: "Boost: Ube",
      goal: "awareness",
      budget: { amount: 300, type: "daily" },
      schedule: { startDate: "2026-11-13T02:00:00.000Z", endDate: "2026-11-16T02:00:00.000Z" },
      targeting: { ageMin: 18, ageMax: 45, countries: ["PH"] },
    });
  });

  it("visits add the link; messages pick the chat for the post's platform; leads add the form", () => {
    const opts = { connectionId: "c_1", name: "b", now };
    expect(toBoostBody(value({ goal: "visits", linkUrl: "https://x.ph" }), opts)).toMatchObject({
      goal: "traffic",
      linkUrl: "https://x.ph",
      callToAction: "LEARN_MORE",
    });
    expect(toBoostBody(value({ goal: "messages", postPlatform: "instagram" }), opts)).toMatchObject(
      {
        goal: "engagement",
        callToAction: "INSTAGRAM_MESSAGE",
      },
    );
    expect(toBoostBody(value({ goal: "messages" }), opts)).toMatchObject({
      callToAction: "MESSAGE_PAGE",
    });
    expect(toBoostBody(value({ goal: "leads", leadFormId: "f_1" }), opts)).toMatchObject({
      goal: "lead_generation",
      leadGenFormId: "f_1",
    });
  });
});

describe("cpcRuleBody", () => {
  it("pauses a campaign whose clicks cost more than the cap today, after 5 clicks", () => {
    expect(
      cpcRuleBody({ connectionId: "c_1", adAccountId: "act_1", maxCpc: 25, currency: "PHP" }),
    ).toEqual({
      name: "Pause a boost if a click costs more than ₱25",
      accountId: "c_1",
      adAccountId: "act_1",
      level: "campaign",
      conditions: {
        all: [
          { metric: "cpc", window: "today", op: ">", value: 25 },
          { metric: "clicks", window: "today", op: ">=", value: 5 },
        ],
      },
      actions: [{ type: "pause" }],
      schedule: { everyMinutes: 60 },
      cooldownMinutes: 1440,
      enabled: true,
    });
  });

  it("money shows whole units in the account's currency", () => {
    expect(money(1500, "PHP")).toBe("₱1,500");
    expect(money(40, "USD")).toBe("$40");
  });
});
