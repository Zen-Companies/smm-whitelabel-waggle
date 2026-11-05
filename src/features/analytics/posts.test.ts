import { describe, expect, it } from "vitest";
import {
  bestPosts,
  csvField,
  cumulativeReach,
  earlyShareLine,
  filterPosts,
  postMeta,
  postsCsv,
  sortPosts,
  timelineStale,
  type PostMetricRow,
} from "./posts";

const post = (over: Partial<PostMetricRow>): PostMetricRow => ({
  id: "p",
  providerPostId: "pp",
  platform: "instagram",
  zernioPostId: null,
  publishedAt: "2026-10-26T08:00:00Z",
  caption: "Fresh ube pandesal",
  permalink: null,
  thumbnailUrl: null,
  format: "photo",
  madeInWaggle: true,
  syncStatus: "synced",
  reach: 100,
  impressions: 200,
  likes: 10,
  comments: 1,
  shares: 1,
  saves: 1,
  clicks: 0,
  views: 0,
  engagementRate: 5,
  ...over,
});

describe("filter and sort", () => {
  const rows = [
    post({ id: "a", reach: 300, format: "reel" }),
    post({ id: "b", reach: 900, madeInWaggle: false }),
    post({ id: "c", reach: 5000, syncStatus: "pending" }),
    post({ id: "d", reach: 50, likes: 400 }),
  ];

  it("filters by where it was made and by type", () => {
    expect(filterPosts(rows, "platform", "any").map((p) => p.id)).toEqual(["b"]);
    expect(filterPosts(rows, "waggle", "reel").map((p) => p.id)).toEqual(["a"]);
    expect(filterPosts(rows, "all", "any")).toHaveLength(4);
  });

  it("sorts by a column with posts still counting last", () => {
    expect(sortPosts(rows, "reach", "desc").map((p) => p.id)).toEqual(["b", "a", "d", "c"]);
    expect(sortPosts(rows, "reach", "asc").map((p) => p.id)).toEqual(["d", "a", "b", "c"]);
    expect(sortPosts(rows, "likes", "desc")[0].id).toBe("d");
  });

  it("best posts rank by likes, comments, shares and saves, skipping pending ones", () => {
    expect(bestPosts(rows, 2).map((p) => p.id)).toEqual(["d", "b"]);
  });

  it("describes a post in one line", () => {
    expect(postMeta(post({ format: "reel" }))).toBe("Reel · Instagram · Oct 26 · made in Waggle");
    expect(postMeta(post({ platform: "facebook", madeInWaggle: false }))).toBe(
      "Photo · Facebook · Oct 26 · posted on Facebook",
    );
  });
});

describe("CSV", () => {
  it("escapes quotes, commas, new lines and formulas", () => {
    expect(csvField('Say "hi", friend')).toBe('"Say ""hi"", friend"');
    expect(csvField("line 1\nline 2")).toBe('"line 1\nline 2"');
    expect(csvField("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvField(null)).toBe("");
    expect(csvField(4.5)).toBe("4.5");
  });

  it("leaves numbers still counting empty", () => {
    const csv = postsCsv([post({ syncStatus: "pending", caption: "a,b" })]);
    const [header, row] = csv.trim().split("\r\n");
    expect(header.split(",")).toContain("Reached");
    expect(row).toContain('"a,b"');
    expect(row.endsWith("Still counting")).toBe(true);
    expect(row).not.toContain(",100,");
  });
});

describe("timeline", () => {
  const day = (i: number, reach: number) => ({
    date: `2026-10-${String(i + 1).padStart(2, "0")}`,
    reach,
    impressions: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    views: 0,
  });

  it("keeps running totals and adds up per-day amounts", () => {
    expect(cumulativeReach([day(0, 10), day(1, 30), day(2, 30)])).toEqual([10, 30, 30]);
    expect(cumulativeReach([day(0, 10), day(1, 5), day(2, 1)])).toEqual([10, 15, 16]);
  });

  it("says when the first two days did most of the work", () => {
    expect(earlyShareLine([4000, 5100, 5800, 6204])).toBe(
      "82% of its reach came in the first 2 days.",
    );
    expect(earlyShareLine([100, 200, 600, 1000])).toBeNull();
    expect(earlyShareLine([1, 2])).toBeNull();
  });

  it("asks again only when missing or stale while the post is young", () => {
    const now = new Date("2026-11-05T12:00:00Z");
    expect(
      timelineStale({ publishedAt: "2026-11-01T00:00:00Z", timelineSyncedAt: null }, now),
    ).toBe(true);
    expect(
      timelineStale(
        { publishedAt: "2026-11-01T00:00:00Z", timelineSyncedAt: "2026-11-05T10:00:00Z" },
        now,
      ),
    ).toBe(false);
    expect(
      timelineStale(
        { publishedAt: "2026-11-01T00:00:00Z", timelineSyncedAt: "2026-11-04T10:00:00Z" },
        now,
      ),
    ).toBe(true);
    // Fetched after the first 14 days had settled: never again.
    expect(
      timelineStale(
        { publishedAt: "2026-09-01T00:00:00Z", timelineSyncedAt: "2026-10-01T00:00:00Z" },
        now,
      ),
    ).toBe(false);
  });
});
