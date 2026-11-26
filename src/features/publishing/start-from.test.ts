import { describe, expect, it } from "vitest";
import { startFrom } from "./start-from";

// Edit and Duplicate open the big window filled in (Posts Round 3).

const row = {
  id: "post-1",
  content: "Black Friday at the bakery",
  media: [{ url: "https://media.zernio.com/loaves.jpg", type: "image", width: 1600, height: 2000 }],
  target_account_ids: ["a-ig", "a-fb", "a-yt"],
  platform_options: {
    instagram: {
      as: "post",
      media: [{ url: "https://media.zernio.com/ig.jpg", type: "image", width: 800, height: 1000 }],
    },
    facebook: { text: "FB words" },
    youtube: { title: "Loaves", visibility: "public" },
    pinterest: { boardId: "b1" },
  },
  scheduled_for: "2026-11-27T01:00:00.000Z",
};

describe("starting from a saved post", () => {
  it("an edit gets everything, with its time in the viewer's zone", () => {
    expect(startFrom(row, "edit", "Asia/Manila")).toEqual({
      postId: "post-1",
      text: "Black Friday at the bakery",
      media: [
        {
          url: "https://media.zernio.com/loaves.jpg",
          kind: "image",
          width: 1600,
          height: 2000,
          seconds: null,
        },
      ],
      accountIds: ["a-ig", "a-fb", "a-yt"],
      options: {
        instagram: { as: "post" },
        facebook: { text: "FB words" },
        youtube: { visibility: "public" },
      },
      crops: {
        instagram: { 0: { url: "https://media.zernio.com/ig.jpg", width: 800, height: 1000 } },
      },
      youtubeTitle: "Loaves",
      when: { day: "2026-11-27", time: "09:00" },
    });
  });

  it("a duplicate gets no time", () => {
    expect(startFrom(row, "duplicate", "Asia/Manila").when).toBeNull();
  });

  it("knows a video, and a post with no file", () => {
    expect(
      startFrom({ ...row, media: [{ url: "https://media.zernio.com/reel.mp4" }] }, "edit", "UTC")
        .media[0]?.kind,
    ).toBe("video");
    expect(startFrom({ ...row, media: [] }, "edit", "UTC").media).toEqual([]);
  });

  it("a carousel keeps its order and each platform's crops by the photo's place", () => {
    const start = startFrom(
      {
        ...row,
        media: [
          { url: "https://media.zernio.com/a.jpg", type: "image", width: 1200, height: 900 },
          { url: "https://media.zernio.com/b.jpg", type: "image", width: 1200, height: 900 },
          { url: "https://media.zernio.com/c.mp4", type: "video" },
        ],
        platform_options: {
          // Instagram: its own crop of the second photo; the rest as they are.
          instagram: {
            media: [
              { url: "https://media.zernio.com/a.jpg", type: "image", from: 0 },
              {
                url: "https://media.zernio.com/b-ig.jpg",
                type: "image",
                width: 800,
                height: 1000,
                from: 1,
              },
              { url: "https://media.zernio.com/c.mp4", type: "video", from: 2 },
            ],
          },
          // Google: the first photo only, no crop.
          googlebusiness: {
            media: [{ url: "https://media.zernio.com/a.jpg", type: "image", from: 0 }],
          },
        },
      },
      "duplicate",
      "UTC",
    );
    expect(start.media.map((m) => m.kind)).toEqual(["image", "image", "video"]);
    expect(start.crops).toEqual({
      instagram: { 1: { url: "https://media.zernio.com/b-ig.jpg", width: 800, height: 1000 } },
    });
  });
});
