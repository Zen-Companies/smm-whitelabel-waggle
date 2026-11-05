import { describe, expect, it } from "vitest";
import type { PostMetricRow } from "./posts";
import { bestTimeRule, formatRule, insightText, standOut, waggleCommentsRule } from "./stood-out";

const post = (format: string, reach: number, syncStatus = "synced") =>
  ({ format, reach, syncStatus }) as PostMetricRow;

describe("formatRule", () => {
  it("compares the best format with photos by median reach", () => {
    const posts = [
      post("reel", 3400),
      post("reel", 3500),
      post("photo", 1000),
      post("photo", 1000),
      post("carousel", 2000),
      post("carousel", 2000),
    ];
    expect(formatRule(posts)).toEqual({
      kind: "format",
      better: "reel",
      worse: "photo",
      ratio: 3.5,
    });
  });

  it("when photos win, compares them with the runner-up", () => {
    const posts = [
      post("photo", 3000),
      post("photo", 3000),
      post("reel", 1000),
      post("reel", 1000),
    ];
    expect(formatRule(posts)).toMatchObject({ better: "photo", worse: "reel", ratio: 3 });
  });

  it("says nothing with too few posts, a small gap or numbers still counting", () => {
    expect(formatRule([post("reel", 3000), post("photo", 1000), post("photo", 900)])).toBeNull();
    expect(
      formatRule([
        post("reel", 1100),
        post("reel", 1100),
        post("photo", 1000),
        post("photo", 1000),
      ]),
    ).toBeNull();
    expect(
      formatRule([
        post("reel", 9000, "pending"),
        post("reel", 9000, "pending"),
        post("photo", 1000),
        post("photo", 1000),
      ]),
    ).toBeNull();
  });
});

describe("bestTimeRule and waggleCommentsRule", () => {
  it("needs at least two posts behind the best slot", () => {
    const slot = { dayOfWeek: 5, hourUtc: 0, avgEngagement: 400, postCount: 6 };
    expect(bestTimeRule([slot])).toEqual({ kind: "best_time", slot });
    expect(bestTimeRule([{ ...slot, postCount: 1 }])).toBeNull();
    expect(bestTimeRule(null)).toBeNull();
  });

  it("needs at least one comment", () => {
    expect(waggleCommentsRule({ comments: 0, answered: 0 })).toBeNull();
    expect(waggleCommentsRule({ comments: 41, answered: 37 })).toEqual({
      kind: "waggle_comments",
      comments: 41,
      answered: 37,
    });
  });
});

describe("standOut", () => {
  it("keeps only the rules with enough data, in order", () => {
    const out = standOut({
      posts: [],
      bestTimes: [{ dayOfWeek: 1, hourUtc: 2, avgEngagement: 5, postCount: 3 }],
      waggleComments: { comments: 41, answered: 37 },
    });
    expect(out.map((i) => i.kind)).toEqual(["best_time", "waggle_comments"]);
  });

  it("writes the sentences", () => {
    const t = insightText({ kind: "format", better: "reel", worse: "photo", ratio: 3.4 });
    expect(`${t.before}${t.strong}${t.after}`).toBe("Reels reached 3.4× more people than photos.");
    const c = insightText({ kind: "waggle_comments", comments: 41, answered: 37 });
    expect(`${c.before}${c.strong}${c.after}`).toBe(
      "Posts made in Waggle got 41 comments; Waggle answered 37 of them.",
    );
  });
});
