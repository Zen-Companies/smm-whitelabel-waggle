import { describe, expect, it } from "vitest";
import {
  handoffParams,
  isSigninLinkUsable,
  mayCreateSigninLink,
  SIGNIN_LINK_MAX_PER_WINDOW,
  SIGNIN_LINK_TTL_MS,
  signinLinkExpiresAt,
  signinLinkNext,
  signinLinkUrl,
} from "./signin-link";

const now = new Date("2026-11-25T10:00:00Z");

describe("sign-in link lifetime", () => {
  it("lasts 10 minutes", () => {
    expect(SIGNIN_LINK_TTL_MS).toBe(600_000);
    expect(signinLinkExpiresAt(now).toISOString()).toBe("2026-11-25T10:10:00.000Z");
  });
  it("works once, before it runs out", () => {
    const expires_at = signinLinkExpiresAt(now).toISOString();
    expect(isSigninLinkUsable({ expires_at, used_at: null }, now)).toBe(true);
    expect(
      isSigninLinkUsable({ expires_at, used_at: null }, new Date("2026-11-25T10:09:59Z")),
    ).toBe(true);
    expect(
      isSigninLinkUsable({ expires_at, used_at: null }, new Date("2026-11-25T10:10:00Z")),
    ).toBe(false);
    expect(isSigninLinkUsable({ expires_at, used_at: now.toISOString() }, now)).toBe(false);
    expect(isSigninLinkUsable({ expires_at: "garbage", used_at: null }, now)).toBe(false);
  });
  it("limits how many are made", () => {
    expect(mayCreateSigninLink(0)).toBe(true);
    expect(mayCreateSigninLink(SIGNIN_LINK_MAX_PER_WINDOW - 1)).toBe(true);
    expect(mayCreateSigninLink(SIGNIN_LINK_MAX_PER_WINDOW)).toBe(false);
  });
});

describe("signinLinkNext", () => {
  it("keeps the setup screen and its own view params", () => {
    expect(signinLinkNext("/welcome")).toBe("/welcome");
    expect(signinLinkNext("/welcome?all=1")).toBe("/welcome?all=1");
    expect(signinLinkNext("/welcome?before=instagram&all=1")).toBe(
      "/welcome?all=1&before=instagram",
    );
  });
  it("drops a connect's error params and unknown values", () => {
    expect(signinLinkNext("/welcome?error=oauth_denied&platform=instagram")).toBe("/welcome");
    expect(signinLinkNext("/welcome?before=tiktok")).toBe("/welcome");
  });
  it("never leaves the site or setup", () => {
    expect(signinLinkNext("https://evil.test/welcome")).toBe("/welcome");
    expect(signinLinkNext("//evil.test/welcome")).toBe("/welcome");
    expect(signinLinkNext("/welcome/../settings")).toBe("/welcome");
    expect(signinLinkNext("/welcomex")).toBe("/welcome");
    expect(signinLinkNext("/settings")).toBe("/welcome");
    expect(signinLinkNext(null)).toBe("/welcome");
  });
});

describe("signinLinkUrl and handoffParams", () => {
  const id = "0b9c6f1e-7a1d-4c2b-9f3e-1a2b3c4d5e6f";
  const hash = "a".repeat(56);
  it("builds the handoff address the route accepts", () => {
    const url = new URL(signinLinkUrl("https://app.waggle.test", id, hash));
    expect(url.origin + url.pathname).toBe("https://app.waggle.test/auth/handoff");
    expect(handoffParams.safeParse(Object.fromEntries(url.searchParams)).success).toBe(true);
  });
  it("refuses a bad id or token", () => {
    expect(handoffParams.safeParse({ id: "x", token_hash: hash }).success).toBe(false);
    expect(handoffParams.safeParse({ id, token_hash: "<script>" }).success).toBe(false);
    expect(handoffParams.safeParse({ id }).success).toBe(false);
  });
});
