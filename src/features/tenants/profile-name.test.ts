import { describe, expect, it } from "vitest";
import { PROFILE_NAME_MAX, zernioProfileName } from "./profile-name";

const tenantId = "3f2a9c1e-7b4d-4e2a-9c1e-7b4d4e2a9c1e";

describe("zernioProfileName", () => {
  it("adds the first 8 hex chars of the tenant id", () => {
    expect(zernioProfileName("Demo Coffee Shop", tenantId)).toBe("Demo Coffee Shop (3f2a9c1e)");
  });

  it("gives two businesses with the same name different profile names", () => {
    const other = "a1b2c3d4-0000-4000-8000-000000000000";
    expect(zernioProfileName("Joe's Cafe", tenantId)).not.toBe(
      zernioProfileName("Joe's Cafe", other),
    );
  });

  it("normalizes whitespace and falls back for an empty name", () => {
    expect(zernioProfileName("  Joe's   Cafe ", tenantId)).toBe("Joe's Cafe (3f2a9c1e)");
    expect(zernioProfileName("   ", tenantId)).toBe("Business (3f2a9c1e)");
  });

  it("truncates long names but keeps the suffix", () => {
    const name = zernioProfileName("x".repeat(300), tenantId);
    expect(name).toHaveLength(PROFILE_NAME_MAX);
    expect(name.endsWith(" (3f2a9c1e)")).toBe(true);
  });
});
