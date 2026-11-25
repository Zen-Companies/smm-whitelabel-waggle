import { describe, expect, it } from "vitest";
import {
  isStartCheckoutPath,
  loginForStart,
  parseStartParam,
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
