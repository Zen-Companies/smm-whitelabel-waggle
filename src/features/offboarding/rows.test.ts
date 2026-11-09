import { describe, expect, it } from "vitest";
import { SocialProviderError } from "@/lib/social/types";
import {
  accountsSummary,
  brandState,
  daysLeft,
  describeFailure,
  issueText,
  nameMatches,
  parseBrandFilter,
} from "./rows";

it("parseBrandFilter keeps known filters only", () => {
  expect(parseBrandFilter("attention")).toBe("attention");
  expect(parseBrandFilter("deleted")).toBe("all");
  expect(parseBrandFilter(undefined)).toBe("all");
});

it("brandState: an issue wins over offboarded", () => {
  expect(brandState({ offboarded_at: null, offboard_issue: null })).toBe("active");
  expect(brandState({ offboarded_at: "2026-11-09", offboard_issue: null })).toBe("offboarded");
  expect(brandState({ offboarded_at: "2026-11-09", offboard_issue: "x" })).toBe("attention");
});

it("daysLeft rounds up and stops at 0", () => {
  const now = new Date("2026-11-09T12:00:00Z");
  expect(daysLeft("2027-02-09T12:00:00Z", now)).toBe(92);
  expect(daysLeft("2026-11-09T13:00:00Z", now)).toBe(1);
  expect(daysLeft("2026-11-01T00:00:00Z", now)).toBe(0);
});

it("nameMatches ignores case and spacing, never matches empty", () => {
  expect(nameMatches("  bloom &  stem florist ", "Bloom & Stem Florist")).toBe(true);
  expect(nameMatches("Bloom", "Bloom & Stem Florist")).toBe(false);
  expect(nameMatches(" ", " ")).toBe(false);
});

describe("failures", () => {
  const err = (status?: number) =>
    new SocialProviderError("x", { status, ambiguous: status === undefined });

  it("describeFailure names who said what", () => {
    expect(describeFailure(err())).toBe("Zernio didn't answer");
    expect(describeFailure(err(503))).toBe("Zernio didn't answer");
    expect(describeFailure(err(429))).toBe("Zernio asked us to slow down");
    expect(describeFailure(err(400))).toBe("Zernio refused it (400)");
    expect(describeFailure(new Error("db"))).toBe("something went wrong on our side");
  });

  it("issueText joins every failed step", () => {
    expect(issueText([])).toBeNull();
    expect(
      issueText([
        { what: "Facebook", error: err() },
        { what: "profile", error: err(400) },
      ]),
    ).toBe(
      "Facebook didn't disconnect: Zernio didn't answer. The Zernio profile wasn't deleted: Zernio refused it (400).",
    );
  });
});

it("accountsSummary: connected platforms, or what Zernio still has", () => {
  const ig = { platform: "instagram", status: "active", released_at: null };
  const fb = { platform: "facebook", status: "disconnected", released_at: null };
  expect(accountsSummary("active", [ig, fb])).toEqual(["Instagram"]);
  expect(accountsSummary("active", [])).toEqual(["Not connected"]);
  expect(accountsSummary("offboarded", [{ ...ig, released_at: "t" }])).toEqual(["Disconnected"]);
  expect(accountsSummary("attention", [{ ...ig, released_at: "t" }, fb])).toEqual([
    "Instagram disconnected",
    "Facebook still connected",
  ]);
});
