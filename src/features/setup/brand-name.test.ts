import { describe, expect, it } from "vitest";
import {
  cleanBusinessName,
  exactPageName,
  nameFromLateAi,
  nameTag,
  pickBrandName,
  profileBusinessName,
  profileBusinessNameFrom,
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

  it("pickBrandName: exact page name (sure), else the AI suggestion, else the display name", () => {
    expect(pickBrandName({ exact: "Wako Page", ai: "Wako AI", display: "wako" })).toEqual({
      name: "Wako Page",
      source: "page",
      sure: true,
    });
    expect(pickBrandName({ exact: null, ai: " Wako  Wako ", display: "wako" })).toEqual({
      name: "Wako Wako",
      source: "ai",
      sure: false,
    });
    expect(pickBrandName({ exact: "  ", ai: "x".repeat(90), display: "WakoCorner" })).toEqual({
      name: "WakoCorner",
      source: "profile",
      sure: false,
    });
    expect(pickBrandName({ exact: null, ai: null, display: "Instagram" })).toBeNull();
  });

  it("nameFromLateAi: a late AI suggestion replaces only a name nobody checked", () => {
    const ai = "Wako Wako Corner";
    // Still a display-name guess: takes the suggestion.
    expect(nameFromLateAi({ pending: false, guessedFrom: "instagram", current: "wako", ai })).toBe(
      ai,
    );
    // No name at all yet: takes it.
    expect(nameFromLateAi({ pending: true, guessedFrom: null, current: "My business", ai })).toBe(
      ai,
    );
    // Sure (exact page name) or confirmed/edited by the owner: left alone.
    expect(nameFromLateAi({ pending: false, guessedFrom: null, current: "Mine", ai })).toBeNull();
    // Same name, or nothing usable: nothing to do.
    expect(nameFromLateAi({ pending: false, guessedFrom: "instagram", current: ai, ai })).toBeNull();
    expect(
      nameFromLateAi({ pending: true, guessedFrom: null, current: "My business", ai: null }),
    ).toBeNull();
  });

  it("nameTag: 'from Instagram' for a guess, nothing when sure", () => {
    const label = (p: string) => (p === "facebook" ? "Facebook" : "Instagram");
    expect(nameTag("instagram", label)).toBe("from Instagram");
    expect(nameTag("facebook", label)).toBe("from Facebook");
    expect(nameTag(null, label)).toBeNull();
  });

  it("profileBusinessNameFrom says which platform the display name came from", () => {
    expect(
      profileBusinessNameFrom(
        [
          { name: "sunnyside", platform: "instagram" },
          { name: "Sunny Side Bakery", platform: "tiktok" },
        ],
        ["sunnyside"],
      ),
    ).toEqual({ name: "Sunny Side Bakery", platform: "tiktok" });
  });
});
