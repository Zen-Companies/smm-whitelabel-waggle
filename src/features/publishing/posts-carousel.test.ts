import { describe, expect, it } from "vitest";
import { platformFiles } from "./carousel";
import { targetExtras } from "./post-options";
import { ruleProblems, withPlatformMedia } from "./posts";

// Posts Round 4: carousels trimmed per platform, and Google's post fields, on the server.

const photo = (n: number) => ({
  url: `https://media.zernio.com/p${n}.jpg`,
  type: "image",
  width: 1080,
  height: 1350,
});
const video = {
  url: "https://media.zernio.com/v.mp4",
  type: "video",
  width: 1080,
  height: 1920,
  seconds: 20,
};

describe("withPlatformMedia", () => {
  it("gives a platform its own set only when it doesn't take the post as it is", () => {
    const media = [photo(1), photo(2), video];
    const out = withPlatformMedia(["instagram", "facebook", "googlebusiness"], media, {});
    expect(out.instagram).toBeUndefined();
    expect(out.facebook?.media?.map((m) => [m.url, m.from])).toEqual([
      [photo(1).url, 0],
      [photo(2).url, 1],
    ]);
    expect(out.googlebusiness?.media).toEqual([
      { url: photo(1).url, type: "image", width: 1080, height: 1350, from: 0 },
    ]);
  });

  it("keeps a platform's own files (its crops) as they are", () => {
    const own = {
      media: [{ url: "https://media.zernio.com/crop.jpg", type: "image" as const, from: 0 }],
    };
    expect(withPlatformMedia(["facebook"], [photo(1), video], { facebook: own }).facebook).toBe(
      own,
    );
  });
});

describe("platformFiles", () => {
  it("puts a crop in place of its photo, in that platform's set only", () => {
    const { files } = platformFiles("instagram", [photo(1), photo(2)], {
      1: { url: "https://media.zernio.com/p2-ig.jpg", width: 1080, height: 1350 },
    });
    expect(files?.map((f) => [f.url, f.from])).toEqual([
      [photo(1).url, 0],
      ["https://media.zernio.com/p2-ig.jpg", 1],
    ]);
    expect(platformFiles("instagram", [photo(1), photo(2)], undefined).files).toBeNull();
  });
});

describe("ruleProblems with several files", () => {
  it("a trimmed platform isn't blocked; a video-only post is blocked on Google", () => {
    const media = [...Array.from({ length: 12 }, (_, i) => photo(i)), video];
    expect(ruleProblems(["facebook", "tiktok", "linkedin"], "Hi", media, {})).toEqual([]);
    expect(ruleProblems(["googlebusiness"], "Hi", [video], {})).toEqual([
      {
        platform: "googlebusiness",
        message: "Google Business doesn't take videos. Add a photo, or leave Google Business out.",
      },
    ]);
  });

  it("checks every file that goes there, not just the first", () => {
    const tall = {
      url: "https://media.zernio.com/tall.jpg",
      type: "image",
      width: 1000,
      height: 3000,
    };
    const problems = ruleProblems(["instagram", "googlebusiness"], "Hi", [photo(1), tall], {});
    expect(problems.map((p) => p.platform)).toEqual(["instagram"]);
  });

  it("TikTok with two videos is blocked", () => {
    expect(ruleProblems(["tiktok"], "Hi", [video, video], {})[0]?.platform).toBe("tiktok");
  });
});

describe("targetExtras for Google", () => {
  it("sends the event and button as platformSpecificData", () => {
    expect(
      targetExtras(
        "googlebusiness",
        {
          google: {
            kind: "event",
            title: "Sourdough class",
            startDay: "2026-11-28",
            startTime: "10:00",
            endDay: "2026-11-28",
            endTime: "13:00",
            button: "CALL",
            buttonUrl: "tel:+63285550142",
          },
        },
        "Learn to bake",
      ),
    ).toEqual({
      platformSpecificData: {
        topicType: "EVENT",
        event: {
          title: "Sourdough class",
          schedule: {
            startDate: { year: 2026, month: 11, day: 28 },
            startTime: { hours: 10, minutes: 0 },
            endDate: { year: 2026, month: 11, day: 28 },
            endTime: { hours: 13, minutes: 0 },
          },
        },
        callToAction: { type: "CALL", url: "tel:+63285550142" },
      },
    });
  });
});
