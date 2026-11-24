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

it("sign-in goes back to an invite link", () => {
  expect(signInNext("/invite/abcdefghijklmnopqrstuvwxyz012345")).toBe(
    "/invite/abcdefghijklmnopqrstuvwxyz012345",
  );
  expect(signInNext("/invite/short")).toBe("/settings");
  expect(signInNext("/invite/abcdefghijklmnopqrstuvwxyz012345/../x")).toBe("/settings");
});

it("sign-in goes back to an AI assistant's Add photos page", () => {
  const id = "67823e7d-3796-4cca-ae36-a1aca1db1967";
  expect(signInNext(`/add-photos/${id}`)).toBe(`/add-photos/${id}`);
  expect(signInNext(`/add-photos/${id}/../../settings`)).toBe("/settings");
  expect(signInNext("/add-photos/not-a-uuid")).toBe("/settings");
  expect(signInNext(`//evil.com/add-photos/${id}`)).toBe("/settings");
});

it("sign-in goes back to HighLevel's checkout link (25 Nov), exactly", () => {
  expect(signInNext("/plan?start=solo")).toBe("/plan?start=solo");
  expect(signInNext("/plan?start=team")).toBe("/plan?start=team");
  expect(signInNext("/plan?start=business")).toBe("/settings");
  expect(signInNext("/plan?start=solo&x=//evil")).toBe("/settings");
});
