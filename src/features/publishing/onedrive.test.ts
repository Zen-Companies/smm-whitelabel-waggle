import { describe, expect, it } from "vitest";
import { driveKind, isUploadedImageUrl, postableItems } from "./onedrive";

describe("OneDrive in the composer (T84c)", () => {
  it("knows photos, videos and folders", () => {
    expect(driveKind({ kind: "file", mimeType: "image/jpeg" })).toBe("image");
    expect(driveKind({ kind: "file", mimeType: "video/mp4" })).toBe("video");
    expect(driveKind({ kind: "folder", mimeType: null })).toBe("folder");
    expect(driveKind({ kind: "file", mimeType: "application/pdf" })).toBeNull();
  });

  it("lists folders first, drops other files, flags big ones", () => {
    const items = postableItems([
      { id: "1", name: "b.jpg", kind: "file", mimeType: "image/jpeg", size: 10 },
      { id: "2", name: "z", kind: "folder", mimeType: null, size: null },
      { id: "3", name: "notes.pdf", kind: "file", mimeType: "application/pdf", size: 10 },
      { id: "4", name: "a.jpg", kind: "file", mimeType: "image/jpeg", size: 50_000_000 },
    ]);
    expect(items.map((i) => i.id)).toEqual(["2", "4", "1"]);
    expect(items.find((i) => i.id === "4")?.tooBig).toBe(true);
  });

  it("accepts only photos already in media storage", () => {
    const real = { mock: false };
    expect(isUploadedImageUrl("https://media.zernio.com/u/abc.jpg", real)).toBe(true);
    expect(isUploadedImageUrl("https://evil.example/abc.jpg", real)).toBe(false);
    expect(isUploadedImageUrl("https://media.zernio.com/u/abc.mp4", real)).toBe(false);
    expect(
      isUploadedImageUrl("http://localhost:3000/api/mock-media/x.png", {
        mock: true,
        appUrl: "http://localhost:3000",
      }),
    ).toBe(true);
  });
});
