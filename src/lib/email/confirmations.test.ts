import { describe, expect, it } from "vitest";
import { hashConfirmToken, newConfirmToken, onlyConfirmed } from "./confirmations";

describe("confirm tokens", () => {
  it("stores only a hash that matches the token", () => {
    const { token, hash } = newConfirmToken();
    expect(hash).toBe(hashConfirmToken(token));
    expect(hash).not.toContain(token);
    expect(newConfirmToken().token).not.toBe(token);
  });
});

describe("onlyConfirmed", () => {
  it("drops people whose email isn't confirmed yet", () => {
    const people = [
      { userId: "a", email: "a@x" },
      { userId: "b", email: "b@x" },
    ];
    expect(onlyConfirmed(people, new Set(["b"]))).toEqual([{ userId: "a", email: "a@x" }]);
    expect(onlyConfirmed(people, new Set())).toEqual(people);
  });
});
