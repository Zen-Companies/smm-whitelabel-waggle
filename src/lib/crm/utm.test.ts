import { describe, expect, it } from "vitest";
import { firstTouchUtm, parseUtmCookie, utmFromParams } from "./utm";

describe("first-touch UTM", () => {
  it("reads the campaign from the link", () => {
    expect(
      utmFromParams(new URLSearchParams("utm_source=meta&utm_campaign=launch&ref=JASON&x=1")),
    ).toEqual({ utm_source: "meta", utm_campaign: "launch", ref_code: "JASON" });
    expect(utmFromParams(new URLSearchParams("x=1"))).toBeNull();
  });

  it("reads the cookie back, ignoring anything that isn't ours", () => {
    expect(parseUtmCookie('{"utm_source":"meta","evil":"x"}')).toEqual({ utm_source: "meta" });
    expect(parseUtmCookie("not json")).toBeNull();
    expect(parseUtmCookie(undefined)).toBeNull();
  });

  it("never overwrites a contact's first campaign", () => {
    const visit = { utm_source: "google", utm_campaign: "retarget" };
    expect(firstTouchUtm(visit, {})).toEqual(visit);
    expect(firstTouchUtm(visit, { utm_source: "meta" })).toEqual({});
    expect(firstTouchUtm(visit, { ref_code: "JASON" })).toEqual({});
    expect(firstTouchUtm(null, {})).toEqual({});
  });
});
