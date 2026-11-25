import { describe, expect, it } from "vitest";
import {
  cropChoicesFor,
  cropRect,
  fitFor,
  outputSize,
  refusedMessage,
  shapeFor,
  shapeLabel,
  showOneShapeForAll,
} from "./media-fit";

const photo = (width: number, height: number) => ({ kind: "image" as const, width, height });
const video = (width: number, height: number, seconds: number | null = 30) => ({
  kind: "video" as const,
  width,
  height,
  seconds,
});

describe("how a photo fits each platform (Posts Round 2)", () => {
  it("Instagram feed: 4:5 and 1:1 fit, other shapes in range are honey, outside is refused", () => {
    expect(fitFor("instagram", photo(1080, 1350))?.level).toBe("fits");
    expect(fitFor("instagram", photo(1080, 1080))?.level).toBe("fits");
    expect(fitFor("instagram", photo(1500, 1000))).toMatchObject({
      level: "trims",
      message: "Instagram looks best at 4:5",
      fixes: ["crop"],
    });
    // The ends of the range still post (9:16 and 1.91:1), with a little tolerance.
    expect(fitFor("instagram", photo(1080, 1920))?.level).toBe("trims");
    expect(fitFor("instagram", photo(1080, 566))?.level).toBe("trims");
    expect(fitFor("instagram", photo(1000, 3000))).toMatchObject({
      level: "refused",
      message: "Instagram won't take this shape",
      fixes: ["crop", "story"],
    });
    expect(fitFor("instagram", photo(3000, 1000))?.level).toBe("refused");
  });

  it("a Story takes any shape; 9:16 fills it", () => {
    expect(fitFor("instagram", photo(1000, 3000), "story")?.level).toBe("trims");
    expect(fitFor("instagram", photo(1080, 1920), "story")?.level).toBe("fits");
    expect(fitFor("facebook", photo(1500, 1000), "story")?.message).toBe(
      "Facebook Stories fill the screen at 9:16",
    );
  });

  it("Google trims anything far from 4:3, and says which side", () => {
    expect(fitFor("googlebusiness", photo(1200, 900))?.level).toBe("fits");
    expect(fitFor("googlebusiness", photo(1500, 1000))?.message).toBe("Google trims the sides");
    expect(fitFor("googlebusiness", photo(1080, 1350))?.message).toBe(
      "Google trims the top and bottom",
    );
  });

  it("LinkedIn, Pinterest, TikTok shapes; Facebook feed, Threads, X and Bluesky always fit", () => {
    expect(fitFor("linkedin", photo(1200, 627))?.level).toBe("fits");
    expect(fitFor("linkedin", photo(1500, 1000))?.level).toBe("trims");
    expect(fitFor("pinterest", photo(1000, 1500))?.level).toBe("fits");
    expect(fitFor("pinterest", photo(1000, 3000))?.message).toBe(
      "Pinterest cuts pins taller than 1:2.1",
    );
    expect(fitFor("tiktok", photo(1080, 1920))?.level).toBe("fits");
    expect(fitFor("tiktok", photo(1500, 1000))?.level).toBe("trims");
    for (const p of ["facebook", "threads", "twitter", "bluesky"]) {
      expect(fitFor(p, photo(1000, 3000))?.level).toBe("fits");
    }
  });

  it("says nothing when the platform doesn't take that kind of file, or the size is unknown", () => {
    expect(fitFor("youtube", photo(1000, 1000))).toBeNull();
    expect(fitFor("googlebusiness", video(1920, 1080))).toBeNull();
    expect(fitFor("instagram", photo(0, 0))).toBeNull();
  });
});

describe("how a video fits each platform", () => {
  it("TikTok needs 9:16", () => {
    expect(fitFor("tiktok", video(1920, 1080))).toMatchObject({
      level: "refused",
      message: "TikTok needs a tall 9:16 video",
      fixes: ["leaveOut"],
    });
    expect(fitFor("tiktok", video(1080, 1920))?.level).toBe("fits");
    expect(fitFor("tiktok", video(1080, 1920, 2))?.level).toBe("refused");
  });

  it("Facebook Reels: 9:16 and up to 60 seconds; the feed takes any video", () => {
    expect(fitFor("facebook", video(1080, 1920, 80), "reel")?.message).toBe(
      "Facebook Reels are up to 60 seconds; this is 1:20",
    );
    expect(fitFor("facebook", video(1920, 1080, 30), "reel")?.level).toBe("refused");
    expect(fitFor("facebook", video(1080, 1920, 30), "reel")?.level).toBe("fits");
    expect(fitFor("facebook", video(1920, 1080, 600))?.level).toBe("fits");
  });

  it("Instagram posts a video as a Reel: 3 s minimum, wide is honey", () => {
    expect(fitFor("instagram", video(1080, 1920))?.message).toBe("Instagram posts it as a Reel");
    expect(fitFor("instagram", video(1920, 1080))?.level).toBe("trims");
    expect(fitFor("instagram", video(1080, 1920, 2))?.level).toBe("refused");
    expect(fitFor("instagram", video(1080, 1920, 90), "story")?.level).toBe("refused");
  });

  it("YouTube: tall or square up to 3 minutes is a Short; 16:9 is a video", () => {
    expect(fitFor("youtube", video(1080, 1920, 60))?.message).toBe("YouTube posts it as a Short");
    expect(fitFor("youtube", video(1080, 1080, 60))?.message).toBe("YouTube posts it as a Short");
    expect(fitFor("youtube", video(1080, 1920, 240))?.level).toBe("trims");
    expect(fitFor("youtube", video(1920, 1080, 600))?.level).toBe("fits");
    expect(fitFor("youtube", video(1440, 1080, 600))?.level).toBe("trims");
  });

  it("LinkedIn 1:2.4 to 2.4:1; Pinterest 4 s minimum", () => {
    expect(fitFor("linkedin", video(3000, 1000))?.level).toBe("refused");
    expect(fitFor("linkedin", video(1920, 1080))?.level).toBe("fits");
    expect(fitFor("pinterest", video(1080, 1920, 3))?.level).toBe("refused");
    expect(fitFor("pinterest", video(1920, 1080))?.level).toBe("trims");
  });
});

describe("crop choices and the one-shape chips", () => {
  it("each platform's shapes, best first", () => {
    expect(cropChoicesFor("instagram").map((c) => c.label)).toEqual([
      "4:5",
      "1:1",
      "9:16",
      "1.91:1",
    ]);
    expect(cropChoicesFor("instagram")[0].best).toBe(true);
    expect(cropChoicesFor("instagram", "story").map((c) => c.label)).toEqual(["9:16"]);
    expect(cropChoicesFor("googlebusiness")[0].label).toBe("4:3");
    expect(cropChoicesFor("pinterest")[0].label).toBe("2:3");
  });

  it("one shape for all shows with 3 or more platforms (accounts on one platform count once)", () => {
    expect(showOneShapeForAll(["instagram", "facebook"])).toBe(false);
    expect(showOneShapeForAll(["instagram", "instagram", "facebook"])).toBe(false);
    expect(showOneShapeForAll(["instagram", "facebook", "linkedin"])).toBe(true);
  });
});

describe("crop geometry", () => {
  it("the largest box of the shape, centred, kept inside the photo", () => {
    expect(cropRect(1500, 1000, 4 / 5)).toEqual({ x: 350, y: 0, w: 800, h: 1000 });
    expect(cropRect(1000, 3000, 1)).toEqual({ x: 0, y: 1000, w: 1000, h: 1000 });
    // Zoomed in and dragged past the edge: stays inside.
    expect(cropRect(1500, 1000, 1, 2, 0, 0)).toEqual({ x: 0, y: 0, w: 500, h: 500 });
    expect(cropRect(1500, 1000, 1, 2, 1500, 1000)).toEqual({ x: 1000, y: 500, w: 500, h: 500 });
  });

  it("saves at the crop's own size, never upscaled, capped", () => {
    expect(outputSize(800, 1000)).toEqual({ width: 800, height: 1000 });
    expect(outputSize(4000, 5000)).toEqual({ width: 1920, height: 2400 });
  });

  it("a platform's own crop replaces the shared photo's shape", () => {
    const shared = photo(1500, 1000);
    expect(shapeFor("instagram", shared, { instagram: { width: 800, height: 1000 } })).toEqual(
      photo(800, 1000),
    );
    expect(shapeFor("facebook", shared, { instagram: { width: 800, height: 1000 } })).toBe(shared);
    const clip = video(1920, 1080);
    expect(shapeFor("tiktok", clip, { tiktok: { width: 1080, height: 1920 } })).toBe(clip);
  });
});

describe("labels and server messages", () => {
  it("names the shape", () => {
    expect(shapeLabel(1500, 1000)).toBe("3:2 wide");
    expect(shapeLabel(1080, 1080)).toBe("Square");
    expect(shapeLabel(1000, 3000)).toBe("1:3 tall");
  });

  it("says how to fix a refused platform", () => {
    const ig = fitFor("instagram", photo(1000, 3000));
    expect(ig && refusedMessage(ig)).toBe(
      "Instagram won't take this shape. Crop it for Instagram or post it as a Story.",
    );
    const tt = fitFor("tiktok", video(1920, 1080));
    expect(tt && refusedMessage(tt)).toBe(
      "TikTok needs a tall 9:16 video. Leave TikTok out or pick another video.",
    );
  });
});
