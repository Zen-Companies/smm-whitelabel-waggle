import { describe, expect, it } from "vitest";
import type { MediaCheck } from "@/lib/social/types";
import { mediaProblems, optionProblems, parsePublishWhen, toPostOptions } from "./post-preview";

const now = new Date("2026-11-18T10:00:00Z");

describe("parsePublishWhen", () => {
  it("now and queue", () => {
    expect(parsePublishWhen("now", now)).toEqual({ mode: "now", at: null });
    expect(parsePublishWhen(" queue ", now)).toEqual({ mode: "queue", at: null });
  });
  it("a date and time with its offset", () => {
    expect(parsePublishWhen("2026-11-18T09:00:00-06:00", now)).toEqual({
      mode: "at",
      at: new Date("2026-11-18T15:00:00Z"),
    });
    expect(parsePublishWhen("2026-11-18T11:00Z", now)).toMatchObject({ mode: "at" });
  });
  it("refuses 'today 11:30am', a time without an offset, the past and too soon", () => {
    expect(parsePublishWhen("today 11:30am", now)).toHaveProperty("error");
    expect(String((parsePublishWhen("today 11:30am", now) as { error: string }).error)).toContain(
      "timezone offset",
    );
    expect(parsePublishWhen("2026-11-18T11:30:00", now)).toHaveProperty("error");
    expect(parsePublishWhen("2026-11-18T09:00:00Z", now)).toHaveProperty("error");
    expect(parsePublishWhen("2026-11-18T10:03:00Z", now)).toHaveProperty("error");
    expect(parsePublishWhen("2028-01-01T10:00:00Z", now)).toHaveProperty("error");
  });
});

const ok = (over: Partial<MediaCheck> = {}): MediaCheck => ({
  valid: true,
  code: null,
  error: null,
  type: "image",
  format: "jpeg",
  size: 400_000,
  platformLimits: { instagram: { withinLimit: true, limitFormatted: "8.0 MB" } },
  ...over,
});

describe("mediaProblems", () => {
  it("a good photo has none", () => {
    expect(mediaProblems(0, ok(), ["instagram", "facebook"])).toEqual([]);
  });
  it("says why a link fails, in words to pass on", () => {
    const unreachable = mediaProblems(1, ok({ valid: false, code: "MEDIA_URL_UNREACHABLE" }), []);
    expect(unreachable[0]).toMatch(/^media\[1\]: couldn't download/);
    expect(unreachable[0]).toContain("Google Drive");
    expect(mediaProblems(0, ok({ valid: false, code: "MEDIA_URL_NOT_ALLOWED" }), [])).toEqual([
      "media[0]: not a public https link.",
    ]);
    expect(mediaProblems(0, ok({ type: "document" }), [])[0]).toContain("only photos and videos");
  });
  it("too big for a chosen platform only", () => {
    const big = ok({
      platformLimits: {
        instagram: { withinLimit: true, limitFormatted: "8.0 MB" },
        bluesky: { withinLimit: false, limitFormatted: "977 KB" },
      },
    });
    expect(mediaProblems(0, big, ["instagram"])).toEqual([]);
    expect(mediaProblems(0, big, ["bluesky"])).toEqual([
      "media[0]: too big for bluesky (limit 977 KB).",
    ]);
  });
});

describe("options", () => {
  it("only choices that fit the chosen platforms", () => {
    expect(
      optionProblems(
        [{ platform: "instagram", post_type: "reel", first_comment: "Menu in bio" }],
        ["instagram"],
      ),
    ).toEqual([]);
    expect(optionProblems([{ platform: "tiktok", post_type: "reel" }], ["instagram"])[0]).toContain(
      "isn't one of the accounts",
    );
    expect(
      optionProblems([{ platform: "pinterest", post_type: "story" }], ["pinterest"])[0],
    ).toContain("post_type is for Instagram and Facebook");
    expect(
      optionProblems([{ platform: "pinterest", first_comment: "x" }], ["pinterest"])[0],
    ).toContain("no first comment");
    expect(
      optionProblems([{ platform: "instagram", pinterest_board_id: "b1" }], ["instagram"])[0],
    ).toContain("Pinterest only");
    expect(
      optionProblems([{ platform: "instagram" }, { platform: "Instagram" }], ["instagram"])[0],
    ).toContain("listed twice");
  });
  it("become the composer's per-platform options", () => {
    expect(
      toPostOptions(
        [
          { platform: "instagram", post_type: "reel", first_comment: "Menu in bio" },
          { platform: "pinterest", pinterest_board_id: "b1", caption: "Ube pandesal" },
        ],
        { youtubeTitle: "Ube pandesal" },
      ),
    ).toEqual({
      instagram: { as: "reel", firstComment: "Menu in bio" },
      pinterest: { boardId: "b1", text: "Ube pandesal" },
      youtube: { title: "Ube pandesal" },
    });
    expect(toPostOptions([{ platform: "facebook" }])).toEqual({});
  });
  it("pass the AI label through (Instagram and YouTube only)", () => {
    expect(
      toPostOptions([
        { platform: "instagram", ai_label: true },
        { platform: "youtube", ai_label: true },
      ]),
    ).toEqual({ instagram: { aiLabel: true }, youtube: { aiLabel: true } });
    expect(optionProblems([{ platform: "facebook", ai_label: true }], ["facebook"])[0]).toContain(
      "ai_label is for Instagram and YouTube",
    );
  });
});
