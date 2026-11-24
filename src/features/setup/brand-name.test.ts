import { describe, expect, it } from "vitest";
import {
  cleanBusinessName,
  exactPageName,
  nameButtonLabel,
  nameGuess,
  prefillValue,
  profileBusinessName,
} from "./brand-name";

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

describe("the name, best source first (24 Nov)", () => {
  it("cleanBusinessName tidies and rejects empty, overlong, non-strings and platform names", () => {
    expect(cleanBusinessName("  Wako  Wako Corner ")).toBe("Wako Wako Corner");
    expect(cleanBusinessName("")).toBeNull();
    expect(cleanBusinessName("x".repeat(81))).toBeNull();
    expect(cleanBusinessName(42)).toBeNull();
    expect(cleanBusinessName(null)).toBeNull();
    expect(cleanBusinessName("Facebook")).toBeNull();
  });

  it("exactPageName takes the first Facebook Page or Google location name", () => {
    expect(
      exactPageName([
        { platform: "instagram", name: "ig name" },
        { platform: "facebook", name: "  " },
        { platform: "googlebusiness", name: "Wako Wako Corner" },
      ]),
    ).toBe("Wako Wako Corner");
    expect(exactPageName([{ platform: "instagram", name: "Sunny" }])).toBeNull();
    expect(exactPageName([])).toBeNull();
  });

  it("nameGuess: AI suggestion, else display name, else empty", () => {
    expect(nameGuess({ ai: "Wako Wako Corner", display: "WakoWakoCorner" })).toBe(
      "Wako Wako Corner",
    );
    expect(nameGuess({ ai: null, display: "WakoWakoCorner" })).toBe("WakoWakoCorner");
    expect(nameGuess({ ai: "x".repeat(90), display: null })).toBe("");
    expect(nameGuess({ ai: null, display: null })).toBe("");
  });

  it("prefillValue fills a newer guess only while the owner hasn't typed", () => {
    expect(prefillValue({ typed: false, current: "Wako", guess: "Wako Wako Corner" })).toBe(
      "Wako Wako Corner",
    );
    expect(prefillValue({ typed: true, current: "Mine", guess: "Wako Wako Corner" })).toBe("Mine");
    expect(prefillValue({ typed: false, current: "Wako", guess: "" })).toBe("Wako");
  });

  it("nameButtonLabel: Yes while the field shows the guess, Save name once edited", () => {
    expect(nameButtonLabel({ value: "Wako Wako Corner", guess: "Wako Wako Corner" })).toBe(
      "Yes, that’s it",
    );
    expect(nameButtonLabel({ value: "Wako Corner", guess: "Wako Wako Corner" })).toBe("Save name");
    expect(nameButtonLabel({ value: "", guess: "" })).toBe("Save name");
  });
});
