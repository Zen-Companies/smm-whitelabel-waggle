import { describe, expect, it } from "vitest";
import { mediaLabel, messageWords, parseAttachments, previewIndex } from "./attachments";

describe("attachments (T72)", () => {
  it("says what was sent instead of (no text)", () => {
    expect(mediaLabel([{ type: "image" }])).toBe("Sent a photo");
    expect(mediaLabel([{ type: "image" }, { type: "image" }, { type: "image" }])).toBe(
      "Sent 3 photos",
    );
    expect(mediaLabel([{ type: "audio" }])).toBe("Sent a voice message");
    expect(mediaLabel([{ type: "share", originalType: "story_mention" }])).toBe(
      "Mentioned you in their story",
    );
    expect(mediaLabel([{ type: "share", originalType: "ig_post" }])).toBe("Shared a post");
    expect(mediaLabel([{ type: "video", originalType: "ig_reel" }])).toBe("Sent a video");
    expect(mediaLabel([{ type: "image" }, { type: "video" }])).toBe("Sent photos and videos");
    expect(mediaLabel([])).toBeNull();
  });

  it("keeps the words when there are some", () => {
    expect(messageWords("Hi!", [{ type: "image" }])).toBe("Hi!");
    expect(messageWords(" ", [{ type: "sticker" }])).toBe("Sent a sticker");
    expect(messageWords("", [])).toBe("Sent something without words");
  });

  it("reads the stored column safely", () => {
    expect(parseAttachments([{ type: "image" }, { nope: 1 }, "x"])).toEqual([{ type: "image" }]);
    expect(parseAttachments(null)).toEqual([]);
  });

  it("previews the first photo only where links need no key", () => {
    expect(previewIndex("instagram", [{ type: "audio" }, { type: "image" }])).toBe(1);
    expect(previewIndex("whatsapp", [{ type: "image" }])).toBeNull();
    expect(previewIndex("facebook", [{ type: "video" }])).toBeNull();
  });
});
