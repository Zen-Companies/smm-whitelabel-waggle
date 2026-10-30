import { describe, expect, it } from "vitest";
import { BUSINESS_PROFILE_MAX, businessContext } from "./business-context";

describe("businessContext", () => {
  it("is the name plus the owner's profile when there is one", () => {
    expect(
      businessContext({ name: "Pixel Presets PH", profile: " Sells Lightroom presets. " }),
    ).toEqual({ text: "Pixel Presets PH. Sells Lightroom presets.", source: "profile" });
  });

  it("falls back to the name alone", () => {
    expect(businessContext({ name: "Harbour Bean Café", profile: "  " })).toEqual({
      text: "Harbour Bean Café",
      source: "name",
    });
    expect(businessContext({ name: "Harbour Bean Café" }).source).toBe("name");
  });

  it("caps the profile", () => {
    const { text } = businessContext({ name: "X", profile: "a".repeat(BUSINESS_PROFILE_MAX + 50) });
    expect(text.length).toBe("X. ".length + BUSINESS_PROFILE_MAX);
  });
});
