import { describe, expect, it } from "vitest";
import { appRobots, signedOutHome } from "./seo";

describe("appRobots", () => {
  it("disallows everything for every crawler", () => {
    expect(appRobots()).toEqual({ rules: { userAgent: "*", disallow: "/" } });
  });
});

describe("signedOutHome", () => {
  it("sends production visitors to the public site", () => {
    expect(signedOutHome("production")).toBe("https://gowaggle.ai/");
  });
  it("keeps sign-in on staging, previews and local", () => {
    expect(signedOutHome("preview")).toBe("/login");
    expect(signedOutHome(undefined)).toBe("/login");
  });
});
