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
      media: {
        url: "https://media.zernio.com/loaves.jpg",
        kind: "image",
        width: 1600,
        height: 2000,
        seconds: null,
      },
      accountIds: ["a-ig", "a-fb", "a-yt"],
      options: {
        instagram: { as: "post" },
        facebook: { text: "FB words" },
        youtube: { visibility: "public" },
      },
      crops: { instagram: { url: "https://media.zernio.com/ig.jpg", width: 800, height: 1000 } },
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
        .media?.kind,
    ).toBe("video");
    expect(startFrom({ ...row, media: [] }, "edit", "UTC").media).toBeNull();
  });
});
