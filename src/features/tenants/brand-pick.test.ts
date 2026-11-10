import { describe, expect, it } from "vitest";
import { brandInitials, brandTint, pickBrand, pickOpenBrand, sectionPath } from "./brand-pick";

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

describe("pickOpenBrand", () => {
  const brands = [
    { id: "a", organization_id: "o1" },
    { id: "b", organization_id: "o1" },
    { id: "c", organization_id: "o2" },
  ];
  const orgs = ["o1", "o2", "o3"];
  it("keeps the brand cookie without an organization cookie", () => {
    expect(pickOpenBrand(brands, orgs, "c", undefined)).toEqual({ brand: brands[2] });
  });
  it("narrows to the open organization", () => {
    expect(pickOpenBrand(brands, orgs, "a", "o2")).toEqual({ brand: brands[2] });
    expect(pickOpenBrand(brands, orgs, "b", "o1")).toEqual({ brand: brands[1] });
  });
  it("opens an organization with no brands empty", () => {
    expect(pickOpenBrand(brands, orgs, "a", "o3")).toEqual({ brand: null, emptyOrgId: "o3" });
  });
  it("ignores an organization the user isn't in", () => {
    expect(pickOpenBrand(brands, orgs, "b", "someone-elses")).toEqual({ brand: brands[1] });
  });
  it("is empty with no brands at all", () => {
    expect(pickOpenBrand([], orgs, undefined, undefined)).toEqual({ brand: null, emptyOrgId: null });
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
