import { describe, expect, it } from "vitest";
import { isUploadedVideoUrl, videoFilename, videoProblem } from "./video";

describe("video uploads (T63)", () => {
  it("takes MP4, MOV and WebM up to 1 GB", () => {
    expect(videoProblem({ type: "video/mp4", size: 48_000_000 })).toBeNull();
    expect(videoProblem({ type: "video/quicktime", size: 1 })).toBeNull();
    expect(videoProblem({ type: "video/avi", size: 1 })).toMatch(/MP4, MOV or WebM/);
    expect(videoProblem({ type: "video/mp4", size: 2 * 1024 ** 3 })).toMatch(/under 1 GB/);
    expect(videoProblem({ type: "video/mp4", size: 0 })).toMatch(/empty/);
  });

  it("names the file by its type", () => {
    expect(videoFilename("video/quicktime")).toBe("video.mov");
  });

  it("only accepts videos uploaded to Zernio (or the mock in a demo)", () => {
    const real = { mock: false };
    expect(isUploadedVideoUrl("https://media.zernio.com/temp/123_video.mp4", real)).toBe(true);
    expect(isUploadedVideoUrl("http://media.zernio.com/temp/123_video.mp4", real)).toBe(false);
    expect(isUploadedVideoUrl("https://evil.example.com/video.mp4", real)).toBe(false);
    expect(isUploadedVideoUrl("https://media.zernio.com/temp/photo.jpg", real)).toBe(false);
    const mock = { mock: true, appUrl: "http://localhost:3000" };
    expect(isUploadedVideoUrl("http://localhost:3000/api/mock-media/abc.mp4", mock)).toBe(true);
    expect(isUploadedVideoUrl("https://media.zernio.com/temp/1.mp4", mock)).toBe(false);
  });
});
