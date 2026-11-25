import { describe, expect, it } from "vitest";
import {
  billingBanner,
  nudgeDue,
  planPageReturn,
  popupFor,
  promoBarHref,
  rememberClosed,
} from "./banners";

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

describe("Your plan's own checkout return (QA, 25 Nov)", () => {
  it("comes back with the success pop-up of the chosen plan, which opens on Your plan", () => {
    expect(planPageReturn("solo")).toBe("/plan?upgrade=nudge&");
    expect(planPageReturn("team")).toBe("/plan?upgrade=team&");
    const back = new URLSearchParams(planPageReturn("solo").split("?")[1] + "checkout=done");
    expect(
      popupFor({
        path: "/plan",
        upgrade: back.get("upgrade"),
        welcome: null,
        welcomeSeen: true,
        outDue: false,
        onPlanToo: true,
      }),
    ).toEqual({ kind: "upgrade", reason: "nudge" });
  });
});

describe("the promotion bar's Choose a plan (fix 25 Nov)", () => {
  /** What BillingPopups shows on an address, given the pop-up closed earlier (null: none). */
  const shown = (closed: string | null, path: string, query: string) => {
    const urlKey = `${path}?${query}`;
    const kept = rememberClosed(closed, urlKey);
    const p = new URLSearchParams(query);
    const fromUrl = popupFor({
      path,
      upgrade: p.get("upgrade"),
      welcome: p.get("welcome"),
      welcomeSeen: true,
      outDue: false,
      onPlanToo: true,
    });
    return { kept, popup: kept === null ? fromUrl : null };
  };
  const tap = (here: string) => promoBarHref({ link: "plan-popup", here, popup: true });

  it("a Free Owner's tap opens the Try Solo pop-up over the page", () => {
    expect(tap("/today")).toBe("/today?upgrade=nudge");
    const [path, query] = tap("/today").split("?");
    expect(shown(null, path, query).popup).toEqual({ kind: "upgrade", reason: "nudge" });
  });

  it("opens again after the pop-up was closed on that page (it did nothing before)", () => {
    // Closed on /today?upgrade=nudge, which drops the parameter: the address moves to /today.
    const after = shown("/today?upgrade=nudge", "/today", "");
    expect(after.kept).toBeNull();
    // Tapping the bar again lands on the same address it was closed on: it opens.
    expect(shown(after.kept, "/today", "upgrade=nudge").popup).toEqual({
      kind: "upgrade",
      reason: "nudge",
    });
  });

  it("stays closed while the address is still the one it was closed on", () => {
    expect(shown("/today?upgrade=nudge", "/today", "upgrade=nudge").popup).toBeNull();
  });

  it("keeps the page's own query", () => {
    expect(tap("/setup?step=3")).toBe("/setup?step=3&upgrade=nudge");
  });

  it("goes to Your plan when the pop-up can't open (not Free, not an Owner)", () => {
    expect(promoBarHref({ link: "plan-popup", here: "/today", popup: false })).toBe("/plan");
  });

  it("any other link is the path staff set", () => {
    expect(promoBarHref({ link: "/plan#referral-title", here: "/today", popup: true })).toBe(
      "/plan#referral-title",
    );
  });
});
