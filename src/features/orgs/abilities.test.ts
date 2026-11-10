import { describe, expect, it } from "vitest";
import { ABILITIES, assignableRoles, can, canManageMember, isOrgRole } from "./abilities";

describe("can", () => {
  it("gives owners everything", () => {
    for (const a of ABILITIES) expect(can("owner", a)).toBe(true);
  });

  it("keeps billing and closing to owners", () => {
    for (const role of ["admin", "member", "viewer"] as const) {
      expect(can(role, "billing.view")).toBe(false);
      expect(can(role, "org.close")).toBe(false);
      expect(can(role, "brand.close")).toBe(false);
    }
  });

  it("lets members approve and post but not change settings", () => {
    expect(can("member", "replies.approve")).toBe(true);
    expect(can("member", "posts.write")).toBe(true);
    expect(can("member", "brand.settings")).toBe(false);
    expect(can("member", "accounts.manage")).toBe(false);
    expect(can("member", "team.manage")).toBe(false);
  });

  it("lets viewers only read", () => {
    expect(can("viewer", "inbox.read")).toBe(true);
    expect(can("viewer", "replies.approve")).toBe(false);
    expect(can("viewer", "posts.write")).toBe(false);
  });

  it("denies without a role", () => {
    expect(can(null, "inbox.read")).toBe(false);
  });
});

describe("assignableRoles", () => {
  it("never lets admins make owners", () => {
    expect(assignableRoles("admin")).not.toContain("owner");
    expect(assignableRoles("owner")).toContain("owner");
    expect(assignableRoles("member")).toEqual([]);
  });
});

describe("canManageMember", () => {
  it("follows the database rules", () => {
    expect(canManageMember("owner", "owner", false)).toBe(true);
    expect(canManageMember("admin", "owner", false)).toBe(false);
    expect(canManageMember("admin", "member", false)).toBe(true);
    expect(canManageMember("owner", "admin", true)).toBe(false);
    expect(canManageMember("member", "viewer", false)).toBe(false);
  });
});

describe("isOrgRole", () => {
  it("accepts only the four roles", () => {
    expect(isOrgRole("viewer")).toBe(true);
    expect(isOrgRole("staff")).toBe(false);
    expect(isOrgRole(undefined)).toBe(false);
  });
});
