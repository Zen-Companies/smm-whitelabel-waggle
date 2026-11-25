import { describe, expect, it } from "vitest";
import {
  mediaKindFromMime,
  mediaKindFromUrl,
  mediaKindOf,
  postMediaOf,
  toMediaItems,
} from "./types";

// Posts round 1 (25 Nov): Zernio gets each file's type, so a video is never read as a photo.

describe("media kinds", () => {
  it("reads the kind from the link's extension, like Zernio", () => {
    expect(mediaKindFromUrl("https://media.zernio.com/temp/1_video.mp4")).toBe("video");
    expect(mediaKindFromUrl("https://media.zernio.com/temp/clip.MOV?sig=1")).toBe("video");
    expect(mediaKindFromUrl("https://media.zernio.com/temp/photo.jpeg")).toBe("image");
    expect(mediaKindFromUrl("https://media.zernio.com/temp/party.gif")).toBe("gif");
    expect(mediaKindFromUrl("https://media.zernio.com/temp/menu.pdf")).toBe("document");
    expect(mediaKindFromUrl("https://media.zernio.com/temp/abc123")).toBeNull();
    // The extension is in the path, not the query.
    expect(mediaKindFromUrl("https://x.test/file?name=a.mp4")).toBeNull();
  });

  it("reads the kind from a MIME type", () => {
    expect(mediaKindFromMime("video/quicktime")).toBe("video");
    expect(mediaKindFromMime("image/webp")).toBe("image");
    expect(mediaKindFromMime("image/gif")).toBe("gif");
    expect(mediaKindFromMime("application/pdf")).toBe("document");
    expect(mediaKindFromMime("application/octet-stream")).toBeNull();
    expect(mediaKindFromMime(null)).toBeNull();
  });

  it("the extension wins; what Waggle stored fills in when the link says nothing", () => {
    expect(mediaKindOf({ url: "https://m.test/abc", type: "video" })).toBe("video");
    expect(mediaKindOf({ url: "https://m.test/a.gif", type: "image" })).toBe("gif");
    expect(mediaKindOf({ url: "https://m.test/abc" })).toBeNull();
  });

  it("builds Zernio's mediaItems: type when known, alt text when given", () => {
    expect(
      toMediaItems([
        { url: "https://m.test/abc", type: "video" },
        { url: "https://m.test/a.jpg", altText: "  Ube pandesal  " },
        { url: "https://m.test/raw", altText: " " },
      ]),
    ).toEqual([
      { type: "video", url: "https://m.test/abc" },
      { type: "image", url: "https://m.test/a.jpg", altText: "Ube pandesal" },
      { url: "https://m.test/raw" },
    ]);
  });

  it("falls back to bare URLs when no media is given", () => {
    expect(postMediaOf({ mediaUrls: ["https://m.test/a.jpg"] })).toEqual([
      { url: "https://m.test/a.jpg" },
    ]);
    expect(postMediaOf({ media: [{ url: "x", type: "video" }], mediaUrls: ["y"] })).toEqual([
      { url: "x", type: "video" },
    ]);
  });
});
