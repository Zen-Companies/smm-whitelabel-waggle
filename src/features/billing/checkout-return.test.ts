import { expect, it } from "vitest";
import { quietCancelPath } from "./checkout-return";

it("backing out of Checkout after sign-up lands on the same page, no pop-up", () => {
  expect(quietCancelPath("/welcome")).toBe("/welcome");
  expect(quietCancelPath("/welcome?start=solo&upgrade=nudge&checkout=done")).toBe("/welcome");
  expect(quietCancelPath("/welcome?all=1&start=team")).toBe("/welcome?all=1");
});

it("only a path on this site", () => {
  expect(quietCancelPath("https://evil.com")).toBeNull();
  expect(quietCancelPath("//evil.com/welcome")).toBeNull();
  expect(quietCancelPath("/\\evil.com")).toBeNull();
  expect(quietCancelPath(null)).toBeNull();
});
