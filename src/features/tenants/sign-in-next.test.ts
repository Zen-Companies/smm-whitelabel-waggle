import { expect, it } from "vitest";
import { signInNext } from "./sign-in-next";

it("sign-in goes back to a consent page only, else Settings", () => {
  expect(signInNext("/oauth/consent?authorization_id=abc_123")).toBe(
    "/oauth/consent?authorization_id=abc_123",
  );
  expect(signInNext("https://evil.com")).toBe("/settings");
  expect(signInNext("//evil.com/oauth/consent?authorization_id=a")).toBe("/settings");
  expect(signInNext("/oauth/consent?authorization_id=a&x=//evil")).toBe("/settings");
  expect(signInNext(null)).toBe("/settings");
});
