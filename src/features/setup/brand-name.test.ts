import { describe, expect, it } from "vitest";
import { profileBusinessName } from "./brand-name";

describe("profileBusinessName", () => {
  it("takes the profile's display name", () => {
    expect(
      profileBusinessName([{ name: "Sunny Side Bakery", platform: "instagram" }], ["sunnyside"]),
    ).toBe("Sunny Side Bakery");
  });

  it("never takes the @username or the platform's name", () => {
    expect(
      profileBusinessName(
        [
          { name: "sunnyside", platform: "instagram" },
          { name: "facebook", platform: "facebook" },
        ],
        ["@SunnySide"],
      ),
    ).toBeNull();
  });

  it("skips empty and overlong names and tidies spaces", () => {
    expect(
      profileBusinessName(
        [
          { name: "  ", platform: "instagram" },
          { name: "x".repeat(81), platform: "facebook" },
          { name: " Harbour   Bean ", platform: "facebook" },
        ],
        [],
      ),
    ).toBe("Harbour Bean");
  });

  it("takes a Facebook Page name even when Zernio's username is the same name (hotfix 24 Nov)", () => {
    expect(
      profileBusinessName(
        [{ name: "Sunny Side Bakery", platform: "facebook" }],
        ["Sunny Side Bakery"],
      ),
    ).toBe("Sunny Side Bakery");
    expect(profileBusinessName([{ name: "SunnySide", platform: "facebook" }], ["SunnySide"])).toBe(
      "SunnySide",
    );
  });

  it("still skips an Instagram display name that only repeats the @handle", () => {
    expect(
      profileBusinessName([{ name: "sunnyside.ph", platform: "instagram" }], ["sunnyside.ph"]),
    ).toBe(null);
  });

  it("takes an Instagram display name with spaces even if it matches the username", () => {
    expect(
      profileBusinessName(
        [{ name: "Sunny Side Bakery", platform: "instagram" }],
        ["Sunny Side Bakery"],
      ),
    ).toBe("Sunny Side Bakery");
  });
});
