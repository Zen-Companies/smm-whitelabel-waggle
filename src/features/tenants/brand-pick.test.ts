import { describe, expect, it } from "vitest";
import { brandInitials, brandTint, pickBrand, sectionPath } from "./brand-pick";

describe("pickBrand", () => {
  const brands = [{ id: "a" }, { id: "b" }];
  it("opens the brand in the cookie", () => {
    expect(pickBrand(brands, "b")).toEqual({ id: "b" });
  });
  it("falls back to the first brand for a missing, stale or foreign cookie", () => {
    expect(pickBrand(brands, undefined)).toEqual({ id: "a" });
    expect(pickBrand(brands, "someone-elses-tenant")).toEqual({ id: "a" });
  });
  it("is null with no brands", () => {
    expect(pickBrand([], "a")).toBeNull();
  });
});

describe("sectionPath", () => {
  it.each([
    ["/inbox", "/inbox"],
    ["/posts/123?x=1", "/posts"],
    ["/inbox/items/abc", "/inbox"],
    ["/knowledge-base#faq", "/knowledge-base"],
    ["/settings", "/settings"],
  ])("%s → %s", (from, to) => {
    expect(sectionPath(from)).toBe(to);
  });
  it.each([null, undefined, "", "https://evil.test", "//evil.test", "/\\evil", "/", "/brands/new"])(
    "%s → the inbox",
    (from) => {
      expect(sectionPath(from)).toBe("/inbox");
    },
  );
});

describe("brandInitials", () => {
  it.each([
    ["Bloom & Stem Florist", "BS"],
    ["Harbour Bean Café", "HB"],
    ["Kusina", "KU"],
    ["  ", "?"],
  ])("%s → %s", (name, initials) => {
    expect(brandInitials(name)).toBe(initials);
  });
});

it("brandTint is stable per id", () => {
  expect(brandTint("abc")).toBe(brandTint("abc"));
});
