import { describe, expect, it } from "vitest";
import { billingBanner, nudgeDue, popupFor } from "./banners";

const DAY = 86_400_000;

describe("Try Solo free: × hides it for 3 days", () => {
  it("is due when never hidden, or 3 days after ×", () => {
    const now = 100 * DAY;
    expect(nudgeDue(null, now)).toBe(true);
    expect(nudgeDue("not a number", now)).toBe(true);
    expect(nudgeDue(String(now - 2 * DAY), now)).toBe(false);
    expect(nudgeDue(String(now - 3 * DAY), now)).toBe(true);
  });
});

describe("the banner on every page", () => {
  it("Free: Try Solo while replies are fine, out when they ran out, nothing at the warning", () => {
    expect(billingBanner({ limitsOn: true, plan: "free", level: "ok" })).toBe("nudge");
    expect(billingBanner({ limitsOn: true, plan: "free", level: "warn" })).toBeNull();
    expect(billingBanner({ limitsOn: true, plan: "free", level: "reached" })).toBe("out");
  });

  it("paid plans: only the out banner, never the nudge", () => {
    expect(billingBanner({ limitsOn: true, plan: "solo", level: "ok" })).toBeNull();
    expect(billingBanner({ limitsOn: true, plan: "business", level: "reached" })).toBe("out");
  });

  it("nothing while limits are off or there's no plan (a test brand)", () => {
    expect(billingBanner({ limitsOn: false, plan: "free", level: "reached" })).toBeNull();
    expect(billingBanner({ limitsOn: true, plan: null, level: null })).toBeNull();
  });
});

describe("which pop-up opens", () => {
  const base = { path: "/today", upgrade: null, welcome: null, welcomeSeen: false, outDue: false };

  it("a ?upgrade= link opens the offer on any page but Your plan", () => {
    expect(popupFor({ ...base, upgrade: "auto_reply" })).toEqual({
      kind: "upgrade",
      reason: "auto_reply",
    });
    expect(popupFor({ ...base, path: "/setup", upgrade: "accounts" })).toEqual({
      kind: "upgrade",
      reason: "accounts",
    });
    expect(popupFor({ ...base, path: "/plan", upgrade: "accounts" })).toBeNull();
    expect(popupFor({ ...base, upgrade: "nonsense" })).toBeNull();
  });

  it("?welcome=1 once, then out of replies once a session", () => {
    expect(popupFor({ ...base, path: "/inbox", welcome: "1" })).toEqual({ kind: "welcome" });
    expect(popupFor({ ...base, path: "/inbox", welcome: "1", welcomeSeen: true })).toBeNull();
    expect(popupFor({ ...base, outDue: true })).toEqual({ kind: "out" });
    expect(popupFor({ ...base, upgrade: "nudge", outDue: true })).toEqual({
      kind: "upgrade",
      reason: "nudge",
    });
  });
});
