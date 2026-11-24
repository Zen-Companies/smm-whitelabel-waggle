import { describe, expect, it } from "vitest";
import {
  abandonedBefore,
  auditActionFor,
  classifyUserAgent,
  CONNECT_ABANDON_AFTER_MS,
  connectFailedDetails,
  mayQueueConnectFailed,
  parseConnectReturn,
  returnOutcome,
  storedUserAgent,
} from "./connect-trace";

const IG_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 334.0.4.32.98";
const FB_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/470.0.0.37.106]";
const TIKTOK =
  "Mozilla/5.0 (Linux; Android 13; SM-G991B Build/TP1A; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0 Mobile Safari/537.36 trill_340 BytedanceWebview/d8a21c6";
const SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const CHROME_DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36";

describe("classifyUserAgent", () => {
  it("names the in-app browsers Meta sign-in breaks in", () => {
    expect(classifyUserAgent(IG_IOS)).toBe("in_app_instagram");
    expect(classifyUserAgent(FB_IOS)).toBe("in_app_facebook");
    expect(classifyUserAgent(TIKTOK)).toBe("in_app_tiktok");
  });
  it("tells phones from computers", () => {
    expect(classifyUserAgent(SAFARI_IOS)).toBe("mobile_browser");
    expect(classifyUserAgent(CHROME_DESKTOP)).toBe("desktop_browser");
  });
  it("other in-app browsers, bots and nothing are other", () => {
    expect(classifyUserAgent("Mozilla/5.0 Snapchat/12.0")).toBe("other");
    expect(classifyUserAgent("curl/8.0")).toBe("other");
    expect(classifyUserAgent(null)).toBe("other");
    expect(classifyUserAgent("")).toBe("other");
  });
});

describe("storedUserAgent", () => {
  it("keeps at most 400 characters, empty as null", () => {
    expect(storedUserAgent("x".repeat(500))).toHaveLength(400);
    expect(storedUserAgent("  ")).toBeNull();
    expect(storedUserAgent(undefined)).toBeNull();
  });
});

describe("parseConnectReturn", () => {
  it("reads Zernio's failure params (docs: If it fails)", () => {
    const r = parseConnectReturn({
      connecting: "facebook",
      error: "no_facebook_pages",
      platform: "facebook",
      error_message: "No Facebook Page was selected.",
      error_reason: "no_pages_granted",
      is_user_fixable: "true",
      request_id: "req_123",
      stage: "callback",
    });
    expect(r).toMatchObject({
      platform: "facebook",
      error: "no_facebook_pages",
      errorMessage: "No Facebook Page was selected.",
      errorReason: "no_pages_granted",
      isUserFixable: true,
      requestId: "req_123",
      stage: "callback",
      saysConnected: false,
    });
  });

  it("reads a success with Zernio's ids", () => {
    const r = parseConnectReturn({
      connecting: "instagram",
      connected: "instagram",
      accountId: "acc_1",
      profileId: "prof_1",
      stage: "callback",
    });
    expect(r).toMatchObject({ platform: "instagram", accountId: "acc_1", saysConnected: true });
  });

  it("is_user_fixable: true / false / missing or junk", () => {
    const base = { connecting: "facebook", error: "x" };
    expect(parseConnectReturn({ ...base, is_user_fixable: "false" })?.isUserFixable).toBe(false);
    expect(parseConnectReturn({ ...base, is_user_fixable: "maybe" })?.isUserFixable).toBeNull();
    expect(parseConnectReturn(base)?.isUserFixable).toBeNull();
  });

  it("caps Zernio's message at 300 characters and takes the first of repeats", () => {
    const r = parseConnectReturn({
      connecting: ["facebook", "instagram"],
      error: "oauth_denied",
      error_message: "m".repeat(1000),
    });
    expect(r?.platform).toBe("facebook");
    expect(r?.errorMessage).toHaveLength(300);
  });

  it("is not a return without the connect's params", () => {
    expect(parseConnectReturn({})).toBeNull();
    expect(parseConnectReturn({ platform: "instagram" })).toBeNull();
    // Ours: stopped before the sign-in started.
    expect(parseConnectReturn({ connect_error: "unavailable", platform: "instagram" })).toBeNull();
    // `error` with no platform may mean something else on a page.
    expect(parseConnectReturn({ error: "x" })).toBeNull();
  });

  it("on /connect/done any platform is a return", () => {
    expect(parseConnectReturn({ platform: "facebook" }, true)?.platform).toBe("facebook");
  });

  it("refuses a platform that isn't an id", () => {
    expect(parseConnectReturn({ connecting: "<script>" })).toBeNull();
    expect(parseConnectReturn({ connecting: "Instagram" })).toBeNull();
  });
});

describe("returnOutcome", () => {
  const ok = { error: null, saysConnected: false };
  it("an error is a failure, except an already finished connection", () => {
    expect(returnOutcome({ ...ok, error: "oauth_denied" }, false)).toBe("failed");
    expect(returnOutcome({ ...ok, error: "oauth_denied" }, true)).toBe("failed");
    expect(returnOutcome({ ...ok, error: "code_already_redeemed" }, false)).toBe("connected");
  });
  it("connected when Zernio says so or the account is here", () => {
    expect(returnOutcome({ ...ok, saysConnected: true }, false)).toBe("connected");
    expect(returnOutcome(ok, true)).toBe("connected");
  });
  it("no error and no account: returned without one", () => {
    expect(returnOutcome(ok, false)).toBe("returned_without_account");
  });
});

describe("auditActionFor", () => {
  it("one action per problem outcome, none for connected", () => {
    expect(auditActionFor("failed")).toBe("account_connect_failed");
    expect(auditActionFor("returned_without_account")).toBe(
      "account_connect_returned_without_account",
    );
    expect(auditActionFor("abandoned")).toBe("account_connect_abandoned");
    expect(auditActionFor("connected")).toBeNull();
  });
});

describe("connectFailedDetails", () => {
  const base = {
    platform: "facebook",
    outcome: "failed" as const,
    error: "no_facebook_pages",
    isUserFixable: true,
    userAgentClass: "in_app_instagram",
  };
  it("Zernio's error, fixable yes, in-app yes", () => {
    expect(connectFailedDetails(base)).toEqual({
      platform: "facebook",
      connect_platform: "facebook",
      connect_error: "no_facebook_pages",
      connect_fixable: "yes",
      connect_in_app: "yes",
    });
  });
  it("no_account / abandoned, fixable unknown, not in-app", () => {
    const a = connectFailedDetails({
      ...base,
      outcome: "returned_without_account",
      error: null,
      isUserFixable: null,
      userAgentClass: "desktop_browser",
    });
    expect(a).toMatchObject({
      connect_error: "no_account",
      connect_fixable: "unknown",
      connect_in_app: "no",
    });
    expect(connectFailedDetails({ ...base, outcome: "abandoned", error: null }).connect_error).toBe(
      "abandoned",
    );
    expect(connectFailedDetails({ ...base, isUserFixable: false }).connect_fixable).toBe("no");
  });
});

describe("mayQueueConnectFailed", () => {
  const now = new Date("2026-11-24T12:00:00Z");
  it("once per 6 hours per brand + platform", () => {
    expect(mayQueueConnectFailed(null, now)).toBe(true);
    expect(mayQueueConnectFailed("2026-11-24T07:00:00Z", now)).toBe(false);
    expect(mayQueueConnectFailed("2026-11-24T06:00:00Z", now)).toBe(true);
    expect(mayQueueConnectFailed(new Date("2026-11-24T05:00:00Z"), now)).toBe(true);
    expect(mayQueueConnectFailed("not a date", now)).toBe(true);
  });
});

describe("abandonedBefore", () => {
  it("2 hours ago", () => {
    const now = new Date("2026-11-24T12:00:00Z");
    expect(now.getTime() - abandonedBefore(now).getTime()).toBe(CONNECT_ABANDON_AFTER_MS);
    expect(abandonedBefore(now).toISOString()).toBe("2026-11-24T10:00:00.000Z");
  });
});
