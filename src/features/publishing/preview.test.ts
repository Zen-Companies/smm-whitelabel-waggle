import { describe, expect, it } from "vitest";
import { initials, previewFrame, previewText, textBelow } from "./preview";

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

  it("each platform's real frame, not a square for everyone (Posts Round 2)", () => {
    const wide = { kind: "image" as const, width: 1500, height: 1000 };
    // Instagram's feed shows a 3:2 photo as it is (it's within 9:16 to 1.91:1).
    expect(previewFrame("instagram", undefined, wide)).toEqual({
      ratio: 1.5,
      fit: "cover",
      tall: false,
    });
    // A very tall photo is cut to the tallest it takes.
    expect(
      previewFrame("instagram", undefined, { kind: "image", width: 1000, height: 3000 }).ratio,
    ).toBe(9 / 16);
    expect(previewFrame("instagram", "story", wide)).toEqual({
      ratio: 9 / 16,
      fit: "contain",
      tall: true,
    });
    expect(previewFrame("googlebusiness", undefined, wide)).toEqual({
      ratio: 4 / 3,
      fit: "cover",
      tall: false,
    });
    expect(previewFrame("facebook", undefined, wide).ratio).toBe(1.5);
    expect(previewFrame("tiktok", undefined, { kind: "video", width: 1080, height: 1920 })).toEqual(
      {
        ratio: 9 / 16,
        fit: "cover",
        tall: true,
      },
    );
    expect(
      previewFrame("youtube", undefined, {
        kind: "video",
        width: 1920,
        height: 1080,
        seconds: 600,
      }),
    ).toEqual({ ratio: 16 / 9, fit: "cover", tall: false });
    expect(previewFrame("linkedin", undefined, null)).toEqual({
      ratio: null,
      fit: "contain",
      tall: false,
    });
    expect(textBelow("instagram")).toBe(true);
    expect(textBelow("linkedin")).toBe(false);
  });

  it("initials", () => {
    expect(initials("Coastal Home Team")).toBe("CH");
    expect(initials("Harbour")).toBe("HA");
  });
});
