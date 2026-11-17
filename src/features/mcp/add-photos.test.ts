import { describe, expect, it } from "vitest";
import { fileKind, isOurUploadUrl, uploadState } from "./add-photos";

describe("add photos", () => {
  it("photos and videos, within size", () => {
    expect(fileKind("image/jpeg", 2_000_000)).toEqual({ type: "image", ext: "jpg" });
    expect(fileKind("video/quicktime", 50_000_000)).toEqual({ type: "video", ext: "mov" });
    expect(fileKind("image/heic", 1000)).toHaveProperty("error");
    expect(fileKind("image/png", 31 * 1024 * 1024)).toEqual({ error: "Use a photo under 30 MB." });
  });
  it("open only for its person, before it expires and until done", () => {
    const now = new Date("2026-11-18T10:00:00Z");
    const row = { created_by: "u1", expires_at: "2026-11-18T10:20:00Z", done_at: null };
    expect(uploadState(row, "u1", now)).toBe("open");
    expect(uploadState(row, "u2", now)).toBe("not_yours");
    expect(uploadState({ ...row, expires_at: "2026-11-18T09:59:00Z" }, "u1", now)).toBe("expired");
    expect(uploadState({ ...row, done_at: "2026-11-18T09:58:00Z" }, "u1", now)).toBe("done");
  });
  it("only links our presign handed out", () => {
    expect(isOurUploadUrl("https://media.zernio.com/temp/a.jpg", { mock: false })).toBe(true);
    expect(isOurUploadUrl("https://evil.example/a.jpg", { mock: false })).toBe(false);
    expect(
      isOurUploadUrl("http://localhost:3000/api/mock-media/a.jpg", {
        mock: true,
        appUrl: "http://localhost:3000",
      }),
    ).toBe(true);
  });
});
