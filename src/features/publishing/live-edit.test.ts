import { describe, expect, it } from "vitest";
import {
  afterLiveEdit,
  canEditLive,
  liveCopies,
  liveEditNote,
  liveEditOutcome,
  liveEditSplit,
} from "./live-edit";

// Fix the text on a live post (Posts Round 3): only where the platform allows it.

describe("which live posts can have their text fixed", () => {
  it("follows the platforms Zernio can edit (docs: /posts/edit-post)", () => {
    for (const p of ["facebook", "linkedin", "googlebusiness", "youtube", "twitter"]) {
      expect(canEditLive(p)).toBe(true);
    }
    for (const p of ["instagram", "tiktok", "threads", "bluesky", "snapchat", "pinterest"]) {
      expect(canEditLive(p)).toBe(false);
    }
  });

  it("splits a post's platforms", () => {
    expect(liveEditSplit(["instagram", "facebook", "googlebusiness", "facebook"])).toEqual({
      editable: ["facebook", "googlebusiness"],
      notEditable: ["instagram"],
    });
  });

  it("says where it changes and where it can't, in the board's words", () => {
    expect(liveEditNote(["instagram", "facebook", "googlebusiness"])).toBe(
      "Fix the text changes it on Facebook and Google Business. Instagram doesn't allow editing a live post.",
    );
    expect(liveEditNote(["instagram"])).toBe(
      "Instagram doesn't allow editing a live post. Take it down and post again.",
    );
    expect(liveEditNote(["instagram", "tiktok"])).toBe(
      "Instagram and TikTok don't allow editing a live post. Take it down and post again.",
    );
    expect(liveEditNote(["facebook"])).toBeNull();
  });

  it("finds the live copies by account, then by platform for older rows", () => {
    const accounts = [
      { platform: "facebook", zernio_account_id: "fb1" },
      { platform: "instagram", zernio_account_id: "ig1" },
      { platform: "linkedin", zernio_account_id: "li1" },
    ];
    expect(
      liveCopies(
        [
          { platform: "facebook", accountId: "fb1", status: "published", url: null, error: null },
          { platform: "instagram", accountId: "ig1", status: "failed", url: null, error: "x" },
          { platform: "linkedin", status: "published", url: null, error: null },
        ],
        accounts,
      ),
    ).toEqual([
      { platform: "facebook", accountId: "fb1" },
      { platform: "linkedin", accountId: "li1" },
    ]);
    // A published post from before per-platform results were kept: every account is live.
    expect(liveCopies([], accounts.slice(0, 1))).toEqual([
      { platform: "facebook", accountId: "fb1" },
    ]);
  });
});

describe("what the post keeps after a fix", () => {
  const row = { content: "Old", options: { facebook: { text: "Old FB", as: "post" as const } } };

  it("every live platform fixed: the new text is the post's text", () => {
    expect(afterLiveEdit(row, ["facebook", "linkedin"], ["facebook", "linkedin"], "New")).toEqual({
      content: "New",
      options: { facebook: { as: "post" } },
    });
  });

  it("some fixed: those platforms keep the new text as their own", () => {
    expect(afterLiveEdit(row, ["instagram", "facebook"], ["facebook"], "New")).toEqual({
      content: "Old",
      options: { facebook: { text: "New", as: "post" } },
    });
  });

  it("nothing fixed: nothing changes", () => {
    expect(afterLiveEdit(row, ["facebook"], [], "New")).toBe(row);
  });

  it("says what happened", () => {
    expect(
      liveEditOutcome(
        ["facebook", "googlebusiness"],
        [{ platform: "linkedin", reason: "Try again." }],
      ),
    ).toBe("Fixed on Facebook and Google Business. LinkedIn: Try again.");
  });
});
