import { describe, expect, it } from "vitest";
import { initials, previewShape, previewText, textBelow } from "./preview";

describe("composer preview (T74a)", () => {
  it("cuts long text at a word where the feed says more", () => {
    const long = "Open house this Saturday, 1 to 3 PM at 412 Harbor Dr. ".repeat(4);
    const ig = previewText("instagram", long);
    expect(ig.more).toBe(true);
    expect(ig.shown.length).toBeLessThanOrEqual(126);
    expect(ig.shown.endsWith("…")).toBe(true);
    expect(previewText("facebook", long)).toEqual({ shown: long.trim(), more: false });
    expect(previewText("instagram", "  Hi!  ")).toEqual({ shown: "Hi!", more: false });
  });

  it("shapes and order per platform", () => {
    expect(previewShape("instagram")).toBe("square");
    expect(previewShape("pinterest")).toBe("tall");
    expect(previewShape("facebook")).toBe("natural");
    expect(textBelow("instagram")).toBe(true);
    expect(textBelow("linkedin")).toBe(false);
  });

  it("initials", () => {
    expect(initials("Coastal Home Team")).toBe("CH");
    expect(initials("Harbour")).toBe("HA");
  });
});
