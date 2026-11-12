import { describe, expect, it } from "vitest";
import { accountLines } from "./account-lines";

describe("accountLines (T66)", () => {
  it("says what Waggle does on each account, as designed", () => {
    expect(accountLines("instagram")).toEqual({ does: "Answers comments and DMs", note: null });
    expect(accountLines("facebook")).toEqual({
      does: "Answers comments, DMs and Page reviews",
      note: null,
    });
    expect(accountLines("googlebusiness")).toEqual({ does: "Answers reviews", note: null });
    expect(accountLines("tiktok")).toEqual({
      does: "Answers comments and DM replies",
      note: "DMs: replies only, 10 within 48 hours",
    });
    expect(accountLines("youtube")).toEqual({
      does: "Answers comments",
      note: "Comments reach Waggle every few minutes",
    });
  });

  it("posting-only accounts say so, with where pins go or what comes later", () => {
    expect(accountLines("pinterest", { pinterestBoardName: "Coffee menu" })).toEqual({
      does: "Posting only",
      note: "Pins go to “Coffee menu”",
    });
    expect(accountLines("pinterest")).toEqual({
      does: "Posting only",
      note: "Pins go to your first board",
    });
    expect(accountLines("telegram")).toEqual({
      does: "Posting only",
      note: "Answering messages comes in an update",
    });
    expect(accountLines("discord")).toEqual({ does: "Posting only", note: null });
  });
});
