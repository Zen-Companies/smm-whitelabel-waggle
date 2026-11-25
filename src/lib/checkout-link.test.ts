import { describe, expect, it } from "vitest";
import {
  afterSignupPath,
  isSignupStartPath,
  isStartCheckoutPath,
  loginForStart,
  parseStartParam,
  signupPlanHref,
  signupStartOf,
  signupStartPath,
  START_PLAN_ID,
  startCheckoutPath,
} from "./checkout-link";

describe("checkout deep link (HighLevel, 25 Nov)", () => {
  it("reads solo and team only, never Business", () => {
    expect(parseStartParam("solo")).toBe("solo");
    expect(parseStartParam("Team")).toBe("team");
    expect(parseStartParam(["solo"])).toBe("solo");
    expect(parseStartParam("business")).toBeNull();
    expect(parseStartParam(undefined)).toBeNull();
  });

  it("Team is Waggle's id business (the ids are swapped)", () => {
    expect(START_PLAN_ID).toEqual({ solo: "solo", team: "business" });
  });

  it("signed out: sign in, then back to the same link", () => {
    expect(loginForStart("/plan", new URLSearchParams("start=solo"))).toBe(
      "/login?next=%2Fplan%3Fstart%3Dsolo",
    );
    expect(loginForStart("/plan", new URLSearchParams("start=business"))).toBeNull();
    expect(loginForStart("/plan", new URLSearchParams())).toBeNull();
    expect(loginForStart("/today", new URLSearchParams("start=solo"))).toBeNull();
  });

  it("the path round-trips through sign-in", () => {
    expect(isStartCheckoutPath(startCheckoutPath("team"))).toBe(true);
    expect(isStartCheckoutPath("/plan?start=team&next=x")).toBe(false);
  });
});

describe("the site's plan cards (/signup?plan=, 25 Nov)", () => {
  it("sign-up with a plan lands on setup's first page, starting Checkout", () => {
    expect(afterSignupPath("solo")).toBe("/welcome?start=solo");
    expect(afterSignupPath("team")).toBe("/welcome?start=team");
    expect(afterSignupPath(null)).toBe("/welcome");
    expect(signupStartPath("team")).toBe("/welcome?start=team");
  });

  it("only the exact path counts as Google's sign-up next", () => {
    expect(isSignupStartPath("/welcome?start=solo")).toBe(true);
    expect(isSignupStartPath("/welcome?start=team")).toBe(true);
    expect(isSignupStartPath("/welcome?start=business")).toBe(false);
    expect(isSignupStartPath("/welcome?start=solo&x=1")).toBe(false);
    expect(isSignupStartPath("//evil.com/welcome?start=solo")).toBe(false);
    expect(signupStartOf("/welcome?start=team")).toBe("team");
    expect(signupStartOf("/welcome?start=solo")).toBe("solo");
    expect(signupStartOf("/plan?start=solo")).toBeNull();
    expect(signupStartOf("/settings")).toBeNull();
  });

  it("switching plans keeps a friend's code and utm, and Free drops the plan", () => {
    const params = { plan: "solo", ref: "abc123", utm_source: "site", junk: ["a", "b"] };
    expect(signupPlanHref(params, "team")).toBe(
      "/signup?ref=abc123&utm_source=site&junk=a&plan=team",
    );
    expect(signupPlanHref({ plan: "team" }, null)).toBe("/signup");
    expect(signupPlanHref({ plan: "team", ref: "abc" }, null)).toBe("/signup?ref=abc");
  });
});
