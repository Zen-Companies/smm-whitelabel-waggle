import { describe, expect, it } from "vitest";
import {
  bestPostThisWeek,
  comparisonLine,
  engagementCell,
  platformSummary,
  postResults,
  rowsByPost,
  showNum,
  updatedLine,
  type BestCandidate,
  type MetricRow,
} from "./post-metrics";

const row = (over: Partial<MetricRow>): MetricRow => ({
  zernio_post_id: "z1",
  platform: "instagram",
  sync_status: "synced",
  reach: 0,
  impressions: 0,
  likes: 0,
  comments: 0,
  shares: 0,
  saves: 0,
  views: 0,
  synced_at: "2026-11-26T10:00:00Z",
  ...over,
});

describe("postResults", () => {
  it("adds Instagram and Facebook up the way the board shows (Facebook's seen counts as reached)", () => {
    const r = postResults(
      ["instagram", "facebook", "googlebusiness"],
      [
        row({ platform: "instagram", reach: 812, likes: 71, comments: 11, shares: 0, saves: 9 }),
        row({
          platform: "facebook",
          reach: 0,
          impressions: 472,
          likes: 25,
          comments: 3,
          shares: 6,
          synced_at: "2026-11-26T10:20:00Z",
        }),
      ],
    );
    expect(r.reached).toBe(1284);
    expect(r.likes).toBe(96);
    expect(r.comments).toBe(14);
    expect(r.shares).toBe(6);
    expect(r.saves).toBe(9);
    expect(r.engagement).toBe(125);
    expect(r.rate).toBe(9.7);
    expect(engagementCell(r)).toBe("125 · 9.7%");
    expect(r.updatedAt).toBe("2026-11-26T10:20:00Z");
    expect(r.platforms.map((l) => l.platform)).toEqual(["instagram", "facebook", "googlebusiness"]);
    const fb = r.platforms[1];
    expect(fb.saves).toBeNull(); // Facebook doesn't report saves: a dash, not 0
    expect(showNum(fb.saves)).toBe("–");
    expect(r.platforms[2].noNumbers).toBe(true);
    expect(r.noneShare).toBe(false);
  });

  it("a Google-only post shares nothing", () => {
    const r = postResults(["googlebusiness"], []);
    expect(r.noneShare).toBe(true);
    expect(r.hasNumbers).toBe(false);
    expect(r.engagement).toBeNull();
    expect(engagementCell(r)).toBe("–");
  });

  it("an app whose numbers aren't in yet waits, and doesn't count as 0", () => {
    const r = postResults(
      ["instagram", "tiktok"],
      [
        row({ platform: "instagram", reach: 100, likes: 5 }),
        row({ platform: "tiktok", sync_status: "pending" }),
      ],
    );
    expect(r.platforms[1].waiting).toBe(true);
    expect(r.reached).toBe(100);
    expect(r.engagement).toBe(5);
  });

  it("no rows yet: no numbers", () => {
    const r = postResults(["instagram"], []);
    expect(r.hasNumbers).toBe(false);
    expect(r.platforms[0].waiting).toBe(true);
    expect(r.reached).toBeNull();
  });

  it("TikTok uses views until its reach arrives", () => {
    const r = postResults(["tiktok"], [row({ platform: "tiktok", views: 300, likes: 20 })]);
    expect(r.reached).toBe(300);
  });

  it("two accounts on one app add up into one line", () => {
    const r = postResults(
      ["instagram"],
      [row({ reach: 10, likes: 1 }), row({ reach: 20, likes: 2 })],
    );
    expect(r.platforms).toHaveLength(1);
    expect(r.reached).toBe(30);
    expect(r.likes).toBe(3);
  });

  it("a real 0 stays 0", () => {
    const r = postResults(["instagram"], [row({ reach: 50 })]);
    expect(r.likes).toBe(0);
    expect(r.engagement).toBe(0);
    expect(r.rate).toBe(0);
  });
});

describe("rowsByPost", () => {
  it("groups by Zernio post and skips rows without one", () => {
    const m = rowsByPost([row({}), row({ zernio_post_id: "z2" }), row({ zernio_post_id: null })]);
    expect(m.get("z1")).toHaveLength(1);
    expect(m.get("z2")).toHaveLength(1);
    expect(m.size).toBe(2);
  });
});

describe("updatedLine", () => {
  const now = new Date("2026-11-26T12:00:00Z");
  it("reads in minutes, hours, days", () => {
    expect(updatedLine(null, now)).toBeNull();
    expect(updatedLine("2026-11-26T11:59:40Z", now)).toBe("Updated just now");
    expect(updatedLine("2026-11-26T11:20:00Z", now)).toBe("Updated 40 min ago");
    expect(updatedLine("2026-11-26T09:00:00Z", now)).toBe("Updated 3 h ago");
    expect(updatedLine("2026-11-25T11:00:00Z", now)).toBe("Updated 1 day ago");
  });
});

describe("platformSummary", () => {
  it("leaves out what the app doesn't report", () => {
    const r = postResults(
      ["facebook"],
      [row({ platform: "facebook", impressions: 472, likes: 25, comments: 3, shares: 6 })],
    );
    expect(platformSummary(r.platforms[0])).toBe("472 reached · 25 likes · 3 comments · 6 shares");
  });
});

describe("comparisonLine", () => {
  it("says it only when clearly above", () => {
    expect(comparisonLine(100, 0)).toBeNull();
    expect(comparisonLine(110, 100)).toBeNull();
    expect(comparisonLine(130, 100)).toBe("above your usual post");
    expect(comparisonLine(125, 60)).toBe("about twice your usual post");
    expect(comparisonLine(300, 100)).toBe("about 3 times your usual post");
  });
});

describe("bestPostThisWeek", () => {
  const now = new Date("2026-11-26T12:00:00Z");
  const weekStart = "2026-11-23T00:00:00Z";
  const cand = (
    postId: string,
    publishedAt: string,
    likes: number,
    reach = 100,
  ): BestCandidate => ({
    postId,
    publishedAt,
    results: postResults(["instagram"], [row({ zernio_post_id: postId, reach, likes })]),
  });

  it("picks the most engaging post of this week and compares with the last 30 days", () => {
    const best = bestPostThisWeek(
      [
        cand("a", "2026-11-25T09:00:00Z", 125, 1284),
        cand("b", "2026-11-24T12:00:00Z", 41),
        cand("c", "2026-11-23T07:00:00Z", 77),
        cand("d", "2026-11-10T07:00:00Z", 60),
        cand("e", "2026-11-05T07:00:00Z", 50),
        cand("old", "2026-09-01T07:00:00Z", 1),
      ],
      weekStart,
      now,
    );
    expect(best?.postId).toBe("a");
    // usual = (41 + 77 + 60 + 50) / 4 = 57 → 125 / 57 ≈ 2.2
    expect(best?.comparison).toBe("about twice your usual post");
  });

  it("is hidden when no post this week has numbers", () => {
    expect(bestPostThisWeek([cand("d", "2026-11-10T07:00:00Z", 60)], weekStart, now)).toBeNull();
    expect(
      bestPostThisWeek(
        [
          {
            postId: "g",
            publishedAt: "2026-11-24T00:00:00Z",
            results: postResults(["googlebusiness"], []),
          },
        ],
        weekStart,
        now,
      ),
    ).toBeNull();
  });

  it("no comparison with too few other posts", () => {
    const best = bestPostThisWeek(
      [cand("a", "2026-11-25T09:00:00Z", 125), cand("b", "2026-11-24T12:00:00Z", 10)],
      weekStart,
      now,
    );
    expect(best?.postId).toBe("a");
    expect(best?.comparison).toBeNull();
  });
});
