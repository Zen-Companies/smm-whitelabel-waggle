import { describe, expect, it } from "vitest";
import type { RcsAgentView } from "@/lib/social/types";
import { launchDefaults, launchDue, parseLaunch, parseTestPhone } from "./launch";

const form = (o: Record<string, string | string[]>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) {
    for (const x of Array.isArray(v) ? v : [v]) f.append(k, x);
  }
  return f;
};

const base = {
  companyOverview: "Harbour Bean is a café in San Francisco serving coffee and pastries.",
  agentOverview: "Order-ready updates and answers to customers who opted in at the counter.",
  interactions: ["TRANSACTIONAL_UPDATES", "CUSTOMER_SUPPORT"],
  example1: "Your order is ready for pickup!",
  example2: "We're open until 6 today. See you soon.",
  example3: "Thanks for your message. Yes, we have oat milk.",
  optIn: ["SALE_POINT"],
  callToAction: "Ask at the counter to get order updates by message. Reply STOP to opt out.",
  ...launchDefaults("Harbour Bean"),
  testVideoUrl: "https://youtu.be/abc123",
};

describe("parseLaunch (T83b)", () => {
  it("builds the launch request", () => {
    expect(parseLaunch(form(base), { us: true, screenshotUrl: null })).toMatchObject({
      ok: true,
      needsScreenshot: false,
      body: {
        interactions: [{ type: "TRANSACTIONAL_UPDATES" }, { type: "CUSTOMER_SUPPORT" }],
        messageExamples: [base.example1, base.example2, base.example3],
        consent: { optInMethods: [{ type: "SALE_POINT" }], doubleOptIn: false },
        testVideoUrl: "https://youtu.be/abc123",
      },
    });
  });

  it("a website opt-in needs its page and a screenshot", () => {
    const web = { ...base, optIn: ["WEBSITE"] };
    expect(parseLaunch(form(web), { us: true, screenshotUrl: null })).toMatchObject({
      field: "callToActionUrl",
    });
    const withUrl = { ...web, callToActionUrl: "https://harbourbean.com/checkout" };
    expect(parseLaunch(form(withUrl), { us: true, screenshotUrl: null })).toMatchObject({
      field: "screenshot",
    });
    expect(
      parseLaunch(form(withUrl), { us: true, screenshotUrl: "https://media.example/s.png" }),
    ).toMatchObject({
      ok: true,
      body: { consent: { callToActionMediaUrl: "https://media.example/s.png" } },
    });
  });

  it("three different examples; the US needs the test video", () => {
    expect(
      parseLaunch(form({ ...base, example3: base.example1 }), { us: true, screenshotUrl: null }),
    ).toMatchObject({
      field: "example3",
    });
    expect(
      parseLaunch(form({ ...base, testVideoUrl: "" }), { us: true, screenshotUrl: null }),
    ).toMatchObject({
      field: "testVideoUrl",
    });
    const r = parseLaunch(form({ ...base, testVideoUrl: "" }), { us: false, screenshotUrl: null });
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(r.body).not.toHaveProperty("testVideoUrl");
  });

  it("the welcome message says how to stop", () => {
    expect(
      parseLaunch(form({ ...base, optInMessage: "Welcome to Harbour Bean messages!" }), {
        us: true,
        screenshotUrl: null,
      }),
    ).toMatchObject({ field: "optInMessage" });
  });
});

describe("launchDue and test phones", () => {
  const agent = (o: Partial<RcsAgentView>) => ({ launchSent: false, ...o }) as RcsAgentView;
  it("US at testing; elsewhere until it's filed", () => {
    expect(launchDue(agent({ country: "US", status: "testing" }))).toBe(true);
    expect(launchDue(agent({ country: "US", status: "requested" }))).toBe(false);
    expect(launchDue(agent({ country: "GB", status: "brand_vetting" }))).toBe(true);
    expect(launchDue(agent({ country: "GB", status: "brand_vetting", launchSent: true }))).toBe(
      false,
    );
    expect(launchDue(agent({ country: "GB", status: "launching" }))).toBe(false);
  });

  it("test phones are international numbers", () => {
    expect(parseTestPhone("+1 (415) 555-0188")).toBe("+14155550188");
    expect(parseTestPhone("4155550188")).toBeNull();
  });
});
