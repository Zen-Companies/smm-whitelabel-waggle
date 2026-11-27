import { describe, expect, it } from "vitest";
import {
  carouselRules,
  chooseFrom,
  moveItem,
  platformFiles,
  platformSet,
  setLabel,
} from "./carousel";

const photos = (n: number) => Array.from({ length: n }, () => "image" as const);

describe("platformSet", () => {
  it("one photo or video goes as is everywhere it's allowed", () => {
    for (const p of ["instagram", "facebook", "googlebusiness", "tiktok", "linkedin"]) {
      expect(platformSet(p, ["image"])).toEqual({
        platform: p,
        indices: [0],
        note: null,
        blocked: null,
      });
    }
    expect(platformSet("facebook", ["video"]).indices).toEqual([0]);
  });

  it("Instagram takes all 5, Facebook all 5, Google the first photo only", () => {
    expect(platformSet("instagram", photos(5))).toMatchObject({
      indices: [0, 1, 2, 3, 4],
      note: null,
    });
    expect(platformSet("facebook", photos(5))).toMatchObject({
      indices: [0, 1, 2, 3, 4],
      note: null,
    });
    const g = platformSet("googlebusiness", photos(5));
    expect(g.indices).toEqual([0]);
    expect(g.note).toBe(
      "Google Business: first photo only. The other 4 photos stay off Google Business",
    );
  });

  it("12 photos and a video: each app gets what it takes (board 2b)", () => {
    const kinds = [...photos(12), "video" as const];
    expect(platformSet("instagram", kinds)).toMatchObject({
      indices: kinds.map((_, i) => i),
      note: null,
    });
    const fb = platformSet("facebook", kinds);
    expect(fb.indices).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(fb.note).toBe("Facebook can't mix photos and a video: the first 10 photos go");
    const tt = platformSet("tiktok", kinds);
    expect(tt.indices).toHaveLength(12);
    expect(tt.note).toBe("TikTok: photos only in a carousel. The video is left out");
    const li = platformSet("linkedin", kinds);
    expect(li.indices).toHaveLength(12);
    expect(li.note).toBe("LinkedIn can't mix photos and a video: the 12 photos go");
    const x = platformSet("twitter", kinds);
    expect(x.indices).toHaveLength(12);
    expect(x.note).toBe("X can't mix photos and a video: the 12 photos go");
    expect(platformSet("googlebusiness", kinds)).toMatchObject({ indices: [0] });
  });

  it("Facebook trims 12 photos to the first 10; Bluesky to 4", () => {
    const fb = platformSet("facebook", photos(12));
    expect(fb.indices).toHaveLength(10);
    expect(fb.note).toBe("Facebook takes up to 10 photos: the first 10 go");
    expect(platformSet("bluesky", photos(6)).indices).toEqual([0, 1, 2, 3]);
  });

  it("Threads takes 20, or 10 when a video is in", () => {
    expect(platformSet("threads", photos(15)).indices).toHaveLength(15);
    const t = platformSet("threads", [...photos(14), "video"]);
    expect(t.indices).toHaveLength(10);
    expect(t.note).toBe("Threads takes up to 10 files with a video: the first 10 go");
  });

  it("TikTok with only videos is blocked; others keep the first video", () => {
    expect(platformSet("tiktok", ["video", "video"]).blocked).toMatch(/not several videos/);
    expect(platformSet("tiktok", ["video"]).blocked).toBeNull();
    const fb = platformSet("facebook", ["video", "video"]);
    expect(fb).toMatchObject({
      indices: [0],
      note: "Facebook takes one video: the first one goes",
    });
    expect(platformSet("instagram", ["video", "video"]).indices).toEqual([0, 1]);
  });

  it("Google refuses a video-only post and drops videos beside a photo", () => {
    expect(platformSet("googlebusiness", ["video"]).blocked).toMatch(/doesn't take videos/);
    const g = platformSet("googlebusiness", ["video", "image", "video"]);
    expect(g.indices).toEqual([1]);
    expect(g.note).toMatch(/first photo only/);
  });

  it("a Story or Reel takes one file", () => {
    expect(platformSet("instagram", photos(3), "story")).toMatchObject({ indices: [0] });
    expect(platformSet("facebook", ["image", "video"], "reel")).toMatchObject({ indices: [1] });
  });

  it("YouTube keeps one video; Pinterest the first file", () => {
    expect(platformSet("youtube", ["image", "video", "video"]).indices).toEqual([1]);
    expect(platformSet("pinterest", photos(3))).toMatchObject({
      indices: [0],
      note: "Pinterest: first one only",
    });
  });

  it("follows the platform table: X takes 20 photos", () => {
    expect(carouselRules("twitter").photos).toBe(20);
    expect(platformSet("twitter", photos(20)).note).toBeNull();
  });
});

describe("helpers", () => {
  it("setLabel", () => {
    expect(setLabel(photos(5))).toBe("5 photos");
    expect(setLabel([...photos(12), "video"])).toBe("12 photos and 1 video");
    expect(setLabel(["video"])).toBe("1 video");
  });

  it("moveItem moves one to a new place", () => {
    expect(moveItem(["a", "b", "c", "d"], 2, 1)).toEqual(["a", "c", "b", "d"]);
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b"], 5, 0)).toEqual(["a", "b"]);
  });
});

describe("choosing which photos go (Round 5, Facebook's Choose)", () => {
  const fourteen = Array.from({ length: 14 }, () => "image" as const);

  it("takes the first ten without a choice", () => {
    const set = platformSet("facebook", fourteen);
    expect(set.indices).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(set.note).toBe("Facebook takes up to 10 photos: the first 10 go");
  });

  it("takes the chosen ten, in post order", () => {
    const pick = [13, 12, 11, 0, 1, 2, 3, 4, 5, 6];
    const set = platformSet("facebook", fourteen, undefined, pick);
    expect(set.indices).toEqual([0, 1, 2, 3, 4, 5, 6, 11, 12, 13]);
    expect(set.note).toBe("Facebook takes up to 10 photos: the 10 you chose go");
  });

  it("fills a short choice in post order and ignores places that aren't there", () => {
    expect(chooseFrom([0, 1, 2, 3, 4], 3, [4, 40])).toEqual([0, 1, 4]);
    expect(chooseFrom([0, 1, 2, 3, 4], 3, [99])).toEqual([0, 1, 2]);
    expect(chooseFrom([0, 1, 2], 3, [2])).toEqual([0, 1, 2]);
  });

  it("sends the chosen photos as Facebook's own files", () => {
    const media = Array.from({ length: 12 }, (_, i) => ({
      url: `https://x/${i}.jpg`,
      type: "image",
    }));
    const { files } = platformFiles("facebook", media, undefined, undefined, [11, 10]);
    expect(files?.map((f) => f.from)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 10, 11]);
  });
});
