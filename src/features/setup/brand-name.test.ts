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
});
