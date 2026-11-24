import { describe, expect, it } from "vitest";
import {
  ago,
  attemptEvent,
  auditEvent,
  chatAnswered,
  countKinds,
  crmEvent,
  customerGates,
  failedTries,
  flagsFor,
  latest,
  listHref,
  matchesAll,
  matchesBase,
  matchesSearch,
  mergeTimeline,
  parseListParams,
  planOf,
  sourceOf,
  stageCounts,
  stuckAt,
  type StageFacts,
  type TimelineEvent,
  whereLine,
} from "./derive";

const base: StageFacts = {
  connected: true,
  setupDone: true,
  setupScreen: null,
  checkoutStartedAt: null,
  checkoutReturnedAt: null,
  billingStatus: null,
};

describe("stuckAt", () => {
  it("Connect until an account came through", () => {
    expect(stuckAt({ ...base, connected: false, setupDone: false })).toBe("connect");
  });
  it("Step 2 or Step 3 from the screen setup was left on", () => {
    expect(stuckAt({ ...base, setupDone: false })).toBe("step2");
    expect(stuckAt({ ...base, setupDone: false, setupScreen: "missed" })).toBe("step2");
    expect(stuckAt({ ...base, setupDone: false, setupScreen: "chat" })).toBe("step3");
    expect(stuckAt({ ...base, setupDone: false, setupScreen: "how" })).toBe("step3");
  });
  it("Checkout when a checkout was opened and nothing came of it", () => {
    const started = { ...base, checkoutStartedAt: "2026-11-24T10:00:00Z" };
    expect(stuckAt(started)).toBe("checkout");
    expect(stuckAt({ ...started, checkoutReturnedAt: "2026-11-24T10:05:00Z" })).toBe("active");
    expect(stuckAt({ ...started, checkoutReturnedAt: "2026-11-23T10:05:00Z" })).toBe("checkout");
    expect(stuckAt({ ...started, billingStatus: "trialing" })).toBe("active");
  });
  it("Active otherwise", () => {
    expect(stuckAt(base)).toBe("active");
  });
});

describe("whereLine and flags", () => {
  const tries = [
    {
      platform: "instagram",
      outcome: "failed",
      startedAt: "2026-11-24T09:10:00Z",
      userAgentClass: "in_app_instagram",
    },
    {
      platform: "instagram",
      outcome: "returned_without_account",
      startedAt: "2026-11-24T09:11:00Z",
      userAgentClass: "in_app_instagram",
    },
    {
      platform: "facebook",
      outcome: "failed",
      startedAt: "2026-11-24T09:16:00Z",
      userAgentClass: "in_app_instagram",
    },
    {
      platform: "instagram",
      outcome: null,
      startedAt: "2026-11-24T09:05:00Z",
      userAgentClass: null,
    },
  ];
  const line = (over: Partial<Parameters<typeof whereLine>[0]>) =>
    whereLine({
      stage: "connect",
      attempts: [],
      reading: false,
      setupChat: {},
      checkoutPlan: null,
      planLabel: "Free",
      ...over,
    });

  it("says the latest connect try", () => {
    expect(line({})).toBe("No connect tries yet");
    expect(line({ attempts: tries })).toBe("Connect failed (Facebook)");
    expect(line({ attempts: [{ ...tries[0], outcome: "abandoned" }] })).toBe(
      "Gave up at Instagram sign-in",
    );
  });
  it("step 2, step 3, checkout", () => {
    expect(line({ stage: "step2", reading: true })).toBe("Reading 30 days of messages");
    expect(
      line({ stage: "step3", setupChat: { kind: "cafe", facts: "ok", mode: "approve" } }),
    ).toBe("Answered 3 of 6 questions");
    expect(line({ stage: "checkout", checkoutPlan: "solo" })).toBe("Left Stripe checkout (Solo)");
  });
  it("counts answers, not their words", () => {
    expect(chatAnswered(null)).toBe(0);
    expect(chatAnswered({ kindWords: "x", labels: {} })).toBe(0);
  });
  it("counts tries that didn't connect", () => {
    expect(failedTries(tries)).toBe(3);
  });
  it("flags: connect failed only while stuck at Connect; idle after 2 days", () => {
    const now = new Date("2026-11-24T12:00:00Z");
    const f = (o: Partial<Parameters<typeof flagsFor>[0]>) =>
      flagsFor({
        stage: "connect",
        failedTries: 3,
        lastActivityAt: null,
        offboardedAt: null,
        isTest: false,
        now,
        ...o,
      }).map((x) => x.label);
    expect(f({})).toEqual(["Connect failed ×3"]);
    expect(f({ stage: "step2" })).toEqual([]);
    expect(f({ stage: "checkout", failedTries: 0 })).toEqual(["Checkout abandoned"]);
    expect(f({ failedTries: 0, lastActivityAt: "2026-11-22T11:00:00Z" })).toEqual([
      "No activity 2 days",
    ]);
    expect(f({ stage: "active", failedTries: 0, lastActivityAt: "2026-11-01T11:00:00Z" })).toEqual(
      [],
    );
    expect(f({ failedTries: 0, offboardedAt: "2026-11-20T00:00:00Z", isTest: true })).toEqual([
      "Offboarded",
      "Test",
    ]);
  });
  it("latest picks the newest time", () => {
    expect(latest(null, "2026-11-01T00:00:00Z", undefined, "2026-11-03T00:00:00Z")).toBe(
      "2026-11-03T00:00:00Z",
    );
    expect(latest(null)).toBeNull();
  });
});

describe("sourceOf", () => {
  const ev = (utm: Record<string, string>) => ({ details: { utm: JSON.stringify(utm) } });
  it("unknown without the sign-up event, organic without a campaign", () => {
    expect(sourceOf(null).kind).toBe("unknown");
    expect(sourceOf({ details: {} })).toMatchObject({
      kind: "organic",
      label: "no campaign link",
    });
  });
  it("referral from the ref code", () => {
    expect(sourceOf(ev({ ref_code: "HARBOUR10", utm_source: "meta" }))).toMatchObject({
      kind: "referral",
      label: "HARBOUR10",
    });
  });
  it("ad from a paid medium or an ads source", () => {
    expect(sourceOf(ev({ utm_source: "meta", utm_campaign: "nov-reels-food" }))).toMatchObject({
      kind: "ad",
      label: "meta · nov-reels-food",
    });
    expect(sourceOf(ev({ utm_source: "newsletter", utm_medium: "cpc" })).kind).toBe("ad");
    expect(sourceOf(ev({ utm_source: "newsletter", utm_medium: "email" })).kind).toBe("organic");
  });
  it("ignores broken details", () => {
    expect(sourceOf({ details: { utm: "{not json" } }).kind).toBe("organic");
    expect(sourceOf({ details: [] }).kind).toBe("organic");
  });
});

describe("planOf", () => {
  it("free, trial and paid", () => {
    expect(planOf(null)).toEqual({ kind: "free", label: "Free" });
    expect(
      planOf({ plan: "solo", status: "canceled", trialEndsAt: null, interval: "month" }),
    ).toEqual({ kind: "free", label: "Free (canceled)" });
    expect(
      planOf({
        plan: "solo",
        status: "trialing",
        trialEndsAt: "2026-12-08T00:00:00Z",
        interval: "month",
      }),
    ).toEqual({ kind: "trial", label: "Solo trial ends 8 Dec" });
    expect(
      planOf({ plan: "team", status: "active", trialEndsAt: null, interval: "month" }),
    ).toEqual({ kind: "paid", label: "Team paid monthly" });
  });
});

describe("list filters", () => {
  const row = {
    name: "Kuya Ben’s Lechon",
    ownerEmail: "ben@kuyabens.example",
    handles: ["kuyabens"],
    source: "ad" as const,
    stage: "connect" as const,
    plan: "free" as const,
    browser: "in_app_instagram",
  };
  it("parses params with safe defaults", () => {
    expect(parseListParams({})).toMatchObject({ range: "all", shown: 25 });
    expect(
      parseListParams({ range: "7d", stuck: "nope", shown: "50", browser: ["in_app_instagram"] }),
    ).toMatchObject({ range: "7d", stuck: undefined, shown: 50, browser: "in_app_instagram" });
    expect(parseListParams({ shown: "99999" }).shown).toBe(25);
  });
  it("searches business, owner email and handle", () => {
    expect(matchesSearch(row, "lechon")).toBe(true);
    expect(matchesSearch(row, "BEN@")).toBe(true);
    expect(matchesSearch(row, "@kuyabens")).toBe(true);
    expect(matchesSearch(row, "@lechonhouse")).toBe(false);
  });
  it("filters, and counts tiles without the stuck filter", () => {
    const p = parseListParams({ stuck: "step2", source: "ad" });
    expect(matchesBase(row, p)).toBe(true);
    expect(matchesAll(row, p)).toBe(false);
    expect(stageCounts([row, { ...row, stage: "active" }])).toMatchObject({
      total: 2,
      connect: 1,
      active: 1,
    });
  });
  it("builds links that keep the other filters", () => {
    const p = parseListParams({ range: "7d", source: "ad" });
    expect(listHref(p, { stuck: "connect" })).toBe(
      "/admin/customers?range=7d&source=ad&stuck=connect",
    );
    expect(listHref(p, { source: undefined, range: undefined })).toBe("/admin/customers");
  });
});

describe("timeline", () => {
  const e = (id: string, at: string): TimelineEvent => ({
    id,
    at,
    kind: "audit",
    title: id,
    detail: null,
  });
  it("merges newest first, keeping ties in order", () => {
    const out = mergeTimeline(
      [e("a", "2026-11-24T09:08:00Z"), e("b", "2026-11-24T09:10:00Z")],
      [e("c", "2026-11-24T09:10:00Z")],
    );
    expect(out.map((x) => x.id)).toEqual(["b", "c", "a"]);
  });
  it("sorts audit rows into kinds, never showing details", () => {
    const name = () => "Sam (support)";
    const staff = auditEvent(
      { id: "1", created_at: "t", action: "staff.customer.viewed", actor: "u", details: {} },
      name,
    );
    expect(staff).toMatchObject({ kind: "staff", title: "Sam (support) opened this page" });
    const checkout = auditEvent(
      {
        id: "2",
        created_at: "t",
        action: "billing.checkout_started",
        actor: "u",
        details: { plan: "solo", secret: "x" },
      },
      name,
    );
    expect(checkout).toMatchObject({ kind: "checkout", title: "Stripe checkout opened (Solo)" });
    const other = auditEvent(
      {
        id: "3",
        created_at: "t",
        action: "setup.done",
        actor: "system",
        details: { text: "customer words" },
      },
      () => "System",
    );
    expect(other).toMatchObject({ kind: "audit", title: "setup.done", detail: "by System" });
    expect(JSON.stringify(other)).not.toContain("customer words");
    expect(countKinds([staff, checkout, other])).toMatchObject({
      staff: 1,
      checkout: 1,
      audit: 1,
      crm: 0,
    });
  });
  it("connect tries and CRM events", () => {
    expect(
      attemptEvent({
        id: "a",
        platform: "instagram",
        startedAt: "s",
        outcome: "failed",
        outcomeAt: "o",
        error: "oauth_failed",
        errorReason: "in_app_browser_blocked",
        isUserFixable: true,
      }),
    ).toMatchObject({
      at: "o",
      title: "Instagram connect failed",
      detail: "in_app_browser_blocked · user can fix",
    });
    expect(
      crmEvent({ id: "c", created_at: "c", event: "connect_failed", status: "sent", sent_at: "s" }),
    ).toMatchObject({
      at: "s",
      title: "GoHighLevel: connect failed",
      detail: "waggle-app-event · sent",
    });
  });
});

describe("customerGates", () => {
  it("view needs customers.view, act needs customers.act, offboarded is read only", () => {
    expect(customerGates(new Set(), false)).toEqual({ view: false, act: false, links: false });
    expect(customerGates(new Set(["customers.view"]), false)).toEqual({
      view: true,
      act: false,
      links: true,
    });
    expect(customerGates(new Set(["customers.view", "customers.act"]), false).act).toBe(true);
    expect(customerGates(new Set(["customers.act"]), false).act).toBe(false);
    expect(customerGates(new Set(["customers.view", "customers.act"]), true)).toEqual({
      view: true,
      act: false,
      links: false,
    });
  });
});

it("ago", () => {
  const now = new Date("2026-11-24T12:00:00Z");
  expect(ago("2026-11-24T11:48:00Z", now)).toBe("12 min ago");
  expect(ago("2026-11-24T09:00:00Z", now)).toBe("3 h ago");
  expect(ago("2026-11-23T09:00:00Z", now)).toBe("Yesterday");
  expect(ago("2026-11-01T09:00:00Z", now)).toBe("1 Nov");
});
