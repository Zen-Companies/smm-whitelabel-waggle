import { describe, expect, it } from "vitest";
import { matchKeys, sha256Hex } from "./hash";
import {
  conversionEventId,
  cookieOptsOut,
  CUSTOM_EVENTS,
  isNewRegistration,
  normalizeEmail,
  REGISTRATION_WINDOW_MS,
} from "./tags";

describe("isNewRegistration", () => {
  const now = new Date("2026-11-18T12:00:00Z");
  it("counts a login made an hour ago", () => {
    expect(isNewRegistration("2026-11-18T11:00:00Z", now)).toBe(true);
  });
  it("counts up to the end of the window, not after", () => {
    const edge = new Date(now.getTime() - REGISTRATION_WINDOW_MS).toISOString();
    const late = new Date(now.getTime() - REGISTRATION_WINDOW_MS - 1000).toISOString();
    expect(isNewRegistration(edge, now)).toBe(true);
    expect(isNewRegistration(late, now)).toBe(false);
  });
  it("ignores missing, unreadable and future dates", () => {
    expect(isNewRegistration(undefined, now)).toBe(false);
    expect(isNewRegistration("not a date", now)).toBe(false);
    expect(isNewRegistration("2026-11-19T12:00:00Z", now)).toBe(false);
  });
});

describe("conversionEventId", () => {
  it("is stable per signup and per checkout, and different between the two", () => {
    expect(conversionEventId("CompleteRegistration", "u1")).toBe("reg-u1");
    expect(conversionEventId("StartTrial", "cs_test_1")).toBe("trial-cs_test_1");
  });

  it("counts the first approved reply once per organization, as a custom event", () => {
    expect(conversionEventId("FirstReplyApproved", "org1")).toBe("first-reply-org1");
    expect(CUSTOM_EVENTS).toContain("FirstReplyApproved");
  });
});

describe("hashing", () => {
  it("normalizes the email before hashing, as Meta and TikTok require", () => {
    expect(normalizeEmail("  Jo@Example.COM ")).toBe("jo@example.com");
    expect(matchKeys("u1", "  Jo@Example.COM ").em).toBe(sha256Hex("jo@example.com"));
  });
  it("is SHA-256 hex", () => {
    expect(sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
  it("never puts the plain email or login id in the keys", () => {
    const keys = matchKeys("user-123", "jo@example.com");
    expect(JSON.stringify(keys)).not.toContain("jo@example.com");
    expect(JSON.stringify(keys)).not.toContain("user-123");
    expect(matchKeys("user-123", undefined).em).toBeUndefined();
  });
});

describe("cookieOptsOut", () => {
  it("finds the opt-out among other cookies", () => {
    expect(cookieOptsOut("a=1; waggle_no_ads=1; b=2")).toBe(true);
    expect(cookieOptsOut("waggle_no_ads=0")).toBe(false);
    expect(cookieOptsOut("")).toBe(false);
  });
});
