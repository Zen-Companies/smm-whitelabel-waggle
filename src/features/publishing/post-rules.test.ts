import { describe, expect, it } from "vitest";
import { checkPlatform, imageMaxBytesFor, needsConsent, textLimitFor } from "./post-rules";

const draft = (d: Partial<{ textLength: number; images: number; videos: number }> = {}) => ({
  textLength: 40,
  images: 0,
  videos: 0,
  ...d,
});

describe("checkPlatform", () => {
  it("lets a text post go to Facebook", () => {
    expect(checkPlatform("facebook", draft())).toEqual({ platform: "facebook", level: "ok" });
  });

  it("blocks Instagram and TikTok without media", () => {
    expect(checkPlatform("instagram", draft()).level).toBe("blocked");
    expect(checkPlatform("tiktok", draft())).toMatchObject({
      level: "blocked",
      message: "TikTok needs a photo or video.",
    });
  });

  it("blocks YouTube without a video, even with a photo", () => {
    expect(checkPlatform("youtube", draft({ images: 1 }))).toMatchObject({
      level: "blocked",
      message: "YouTube needs a video.",
    });
  });

  it("blocks text over the platform's limit and says by how much", () => {
    expect(checkPlatform("bluesky", draft({ textLength: 320 }))).toMatchObject({
      level: "blocked",
      message: "Bluesky: 300 characters max. Shorten the text by 20.",
    });
    expect(checkPlatform("twitter", draft({ textLength: 280 })).level).not.toBe("blocked");
  });

  it("notes when Google keeps only the first photo", () => {
    expect(checkPlatform("googlebusiness", draft({ images: 2 }))).toMatchObject({
      level: "note",
      message: "Shows only the first photo.",
    });
  });

  it("blocks too many photos where extras aren't dropped", () => {
    expect(checkPlatform("bluesky", draft({ images: 5 }))).toMatchObject({
      level: "blocked",
      message: "Bluesky: up to 4 photos.",
    });
  });

  it("shows the platform note when nothing else applies", () => {
    expect(checkPlatform("tiktok", draft({ images: 2 })).level).toBe("note");
  });

  it("blocks platforms without posts, and unknown ids", () => {
    expect(checkPlatform("whatsapp", draft()).level).toBe("blocked");
    expect(checkPlatform("myspace", draft()).level).toBe("blocked");
  });
});

describe("limits across platforms", () => {
  it("uses the smallest text limit", () => {
    expect(textLimitFor(["instagram", "threads"], 2200)).toBe(500);
    expect(textLimitFor([], 2200)).toBe(2200);
  });

  it("uses the strictest image size", () => {
    expect(imageMaxBytesFor(["instagram", "bluesky"], 5 * 1024 * 1024)).toBe(1_000_000);
    expect(imageMaxBytesFor(["facebook"], 5 * 1024 * 1024)).toBe(4 * 1024 * 1024);
  });

  it("asks for consent only with TikTok", () => {
    expect(needsConsent(["instagram"])).toBe(false);
    expect(needsConsent(["instagram", "tiktok"])).toBe(true);
  });
});
