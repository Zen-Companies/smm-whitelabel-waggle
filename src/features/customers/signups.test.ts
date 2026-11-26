import { describe, expect, it } from "vitest";
import { matchesAll, parseListParams, stageCounts } from "./derive";
import {
  mergeBySignup,
  type SignupFacts,
  signInMethod,
  signupHref,
  signupRow,
  usersWithoutBusiness,
} from "./signups";

const now = new Date("2026-11-26T12:00:00Z");

const facts: SignupFacts = {
  userId: "u1",
  email: "sharice@example.com",
  name: "Sharice",
  signedUpAt: "2026-11-25T05:41:00Z",
  provider: "google",
  orgName: "Sharice's Organization",
  confirmation: null,
  bill: null,
  signedUpEvent: { details: {} },
  lastSeenAt: "2026-11-25T05:45:00+00:00",
};

describe("usersWithoutBusiness", () => {
  const memberships = [
    { user_id: "a", organization_id: "orgA" },
    { user_id: "b", organization_id: "orgB" },
    { user_id: "b", organization_id: "team" },
    { user_id: "c", organization_id: "orgC" },
    { user_id: "d", organization_id: "orgD" },
    { user_id: "s", organization_id: "orgS" },
  ];
  const run = (candidates: string[]) =>
    usersWithoutBusiness({
      candidates,
      memberships,
      orgsWithBusiness: new Set(["team", "orgC"]),
      tenantMembers: new Set(["d"]),
      staff: new Set(["s"]),
    });

  it("keeps logins whose organizations hold no business", () => {
    expect(run(["a"])).toEqual(["a"]);
  });
  it("drops a business in any of their organizations (a team counts)", () => {
    expect(run(["b", "c"])).toEqual([]);
  });
  it("drops a business shared directly, staff, and logins with no organization", () => {
    expect(run(["d", "s", "nobody"])).toEqual([]);
  });
  it("keeps the order and drops repeats", () => {
    expect(run(["a", "x", "a"])).toEqual(["a"]);
  });
});

describe("signupRow", () => {
  it("reads No business yet, never tapped Connect, Free, with Google", () => {
    const row = signupRow(facts, now);
    expect(row).toMatchObject({
      id: "u1",
      href: "/admin/customers/user/u1",
      name: "No business yet",
      ownerEmail: "sharice@example.com",
      ownerName: "Sharice",
      signUpMethod: "Google",
      stage: "no_business",
      where: "Organization: Sharice's Organization",
      plan: "free",
      planLabel: "Free",
      source: "organic",
      sourceLabel: "no campaign link",
      emailUnconfirmed: false,
      lastTry: null,
      handles: [],
    });
  });
  it("source from the signed_up event's UTMs; unknown without one", () => {
    const utm = JSON.stringify({ utm_source: "meta", utm_campaign: "nov-reels" });
    const ad = signupRow({ ...facts, signedUpEvent: { details: { utm } } }, now);
    expect(ad.source).toBe("ad");
    expect(signupRow({ ...facts, signedUpEvent: null }, now).source).toBe("unknown");
  });
  it("unconfirmed email, idle flag after 2 days, the organization's plan", () => {
    const row = signupRow(
      {
        ...facts,
        provider: "email",
        confirmation: { confirmed_at: null },
        lastSeenAt: "2026-11-21T12:00:00Z",
        bill: { plan: "solo", status: "trialing", trial_ends_at: null, billing_interval: null },
      },
      now,
    );
    expect(row.signUpMethod).toBe("email");
    expect(row.emailUnconfirmed).toBe(true);
    expect(row.flags.map((f) => f.key)).toEqual(["idle"]);
    expect(row.plan).toBe("trial");
  });
  it("filters and counts under No business yet, and search finds the owner's name", () => {
    const row = signupRow(facts, now);
    expect(matchesAll(row, parseListParams({ stuck: "no_business" }))).toBe(true);
    expect(matchesAll(row, parseListParams({ stuck: "connect" }))).toBe(false);
    expect(matchesAll(row, parseListParams({ q: "sharice" }))).toBe(true);
    expect(stageCounts([row]).no_business).toBe(1);
  });
});

describe("mergeBySignup", () => {
  it("newest sign-up first across both lists, comparing times not strings", () => {
    const merged = mergeBySignup(
      [
        { id: "biz-new", signedUpAt: "2026-11-25T06:00:00+00:00" },
        { id: "biz-old", signedUpAt: "2026-11-20T00:00:00+00:00" },
      ],
      [
        { id: "u-mid", signedUpAt: "2026-11-25T05:41:00.5Z" },
        { id: "u-newest", signedUpAt: "2026-11-26T00:00:00Z" },
      ],
    );
    expect(merged.map((r) => r.id)).toEqual(["u-newest", "biz-new", "u-mid", "biz-old"]);
  });
});

describe("small helpers", () => {
  it("sign-in method and page address", () => {
    expect(signInMethod("google")).toBe("Google");
    expect(signInMethod("email")).toBe("email");
    expect(signInMethod(null)).toBeNull();
    expect(signupHref("abc")).toBe("/admin/customers/user/abc");
  });
});
