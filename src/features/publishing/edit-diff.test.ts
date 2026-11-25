import { describe, expect, it } from "vitest";
import { editDiff, updateFields, type EditablePost } from "./edit-diff";

// Edit a planned post (Posts Round 3): only what changed goes to Zernio's update.

const before: EditablePost = {
  content: "Black Friday at the bakery",
  media: [{ url: "https://media.zernio.com/loaves.jpg", type: "image" }],
  accountIds: ["a-ig", "a-fb"],
  options: { facebook: { text: "FB words", as: "post" } },
  scheduledFor: "2026-11-27T01:00:00.000Z",
};
const accounts = [
  { platform: "instagram", zernio_account_id: "z-ig" },
  { platform: "facebook", zernio_account_id: "z-fb" },
];

describe("what an edit changed", () => {
  it("nothing, when nothing moved (option key order doesn't count)", () => {
    expect(
      editDiff(before, {
        ...before,
        accountIds: ["a-fb", "a-ig"],
        options: { facebook: { as: "post", text: "FB words" } },
        scheduledFor: "2026-11-27T09:00:00.000+08:00",
      }),
    ).toEqual([]);
  });

  it("each part on its own", () => {
    expect(editDiff(before, { ...before, content: "New" })).toEqual(["text"]);
    expect(editDiff(before, { ...before, media: [] })).toEqual(["media"]);
    expect(editDiff(before, { ...before, accountIds: ["a-ig"] })).toEqual(["accounts"]);
    expect(editDiff(before, { ...before, options: {} })).toEqual(["options"]);
    expect(editDiff(before, { ...before, scheduledFor: "2026-11-26T01:00:00.000Z" })).toEqual([
      "time",
    ]);
  });
});

describe("the update Zernio gets", () => {
  it("a move sends only the new time", () => {
    const at = "2026-11-26T01:00:00.000Z";
    expect(updateFields(["time"], { ...before, scheduledFor: at }, accounts, false)).toEqual({
      publishAt: new Date(at),
    });
  });

  it("new text sends the text and the platforms (each platform's own text rides on it)", () => {
    const after = { ...before, content: "New caption" };
    expect(updateFields(["text"], after, accounts, false)).toEqual({
      content: "New caption",
      targets: [
        { platform: "instagram", accountId: "z-ig" },
        { platform: "facebook", accountId: "z-fb" },
      ],
      extras: { instagram: {}, facebook: { customContent: "FB words" } },
      tiktokConsent: false,
    });
  });

  it("removed photo sends an empty file list; a crop goes as that platform's own file", () => {
    const after: EditablePost = {
      ...before,
      media: [],
      options: {
        instagram: {
          media: [{ url: "https://media.zernio.com/crop.jpg", type: "image", width: 4, height: 5 }],
        },
      },
    };
    const out = updateFields(["media", "options"], after, accounts, false);
    expect(out.media).toEqual([]);
    expect(out.extras?.instagram).toEqual({
      customMedia: [{ type: "image", url: "https://media.zernio.com/crop.jpg" }],
    });
    expect(out.content).toBeUndefined();
    expect(out.publishAt).toBeUndefined();
  });
});
