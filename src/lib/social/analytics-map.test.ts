import { describe, expect, it } from "vitest";
import {
  postFormat,
  toBestTimes,
  toDashboard,
  toDemographics,
  toFollowerSeries,
  toOnlineFollowers,
  toPostList,
  toTimeline,
} from "./analytics-map";

describe("toDashboard", () => {
  it("maps Zernio's dashboard and fills missing numbers with 0", () => {
    const d = toDashboard(
      {
        dateRange: { fromDate: "2026-10-07", toDate: "2026-11-05" },
        totals: { impressions: 12, reach: 2, comments: 6, engagementRate: 50 },
        previousTotals: { reach: 1 },
        followers: {
          current: 3,
          gained: 1,
          byAccount: [{ accountId: "a1", platform: "instagram", current: 3, gained: 1 }],
        },
        daily: [{ date: "2026-11-05", reach: 2 }],
        topPosts: [
          { postId: "p1", platform: "instagram", metrics: { likes: 4 } },
          { platform: "x" },
        ],
        recentPosts: [],
        dataAsOf: "2026-11-05T19:52:11.322Z",
      },
      { fromDate: "x", toDate: "y" },
    );
    expect(d.totals).toMatchObject({ reach: 2, comments: 6, likes: 0, engagementRate: 50 });
    expect(d.previousTotals?.reach).toBe(1);
    expect(d.previousFollowers).toBeNull();
    expect(d.followers.byAccount).toEqual([
      { accountId: "a1", platform: "instagram", current: 3, gained: 1 },
    ]);
    expect(d.daily[0]).toEqual({
      date: "2026-11-05",
      impressions: 0,
      reach: 2,
      engagement: 0,
      views: 0,
      followersGained: 0,
    });
    expect(d.topPosts).toHaveLength(1);
    expect(d.dataAsOf).toBe("2026-11-05T19:52:11.322Z");
  });
});

describe("postFormat", () => {
  it.each([
    [undefined, "REELS", "reel"],
    ["video", "STORY", "story"],
    ["carousel", null, "carousel"],
    ["image", "FEED", "photo"],
    ["video", null, "video"],
    [null, null, "post"],
  ])("%s / %s → %s", (media, product, format) => {
    expect(postFormat(media, product)).toBe(format);
  });
});

describe("toPostList", () => {
  it("maps posts, keeps pending numbers marked, drops unsafe links", () => {
    const { posts, pages } = toPostList({
      posts: [
        {
          _id: "a1",
          latePostId: "z1",
          content: "Ube",
          publishedAt: "2026-10-26T08:00:00Z",
          platform: "instagram",
          platformPostUrl: "https://www.instagram.com/p/1",
          thumbnailUrl: "javascript:alert(1)",
          mediaType: "video",
          mediaProductType: "REELS",
          analytics: { reach: 6204, likes: 412 },
          platforms: [{ syncStatus: "pending" }],
        },
        { _id: "a2", platform: "facebook", isExternal: true },
        { content: "no id" },
      ],
      pagination: { page: 1, pages: 3 },
    });
    expect(pages).toBe(3);
    expect(posts).toHaveLength(2);
    expect(posts[0]).toMatchObject({
      postId: "a1",
      zernioPostId: "z1",
      format: "reel",
      isExternal: false,
      syncStatus: "pending",
      thumbnailUrl: null,
      permalink: "https://www.instagram.com/p/1",
    });
    expect(posts[0].metrics.reach).toBe(6204);
    expect(posts[1]).toMatchObject({ isExternal: true, zernioPostId: null, caption: "" });
  });
});

describe("audience mapping", () => {
  it("follower series per account, sorted by date", () => {
    expect(
      toFollowerSeries({
        stats: {
          acc: [
            { date: "2026-11-02T00:00:00Z", followers: 5 },
            { date: "2026-11-01", followers: 4 },
          ],
        },
      }),
    ).toEqual([
      {
        accountId: "acc",
        points: [
          { date: "2026-11-01", followers: 4 },
          { date: "2026-11-02", followers: 5 },
        ],
      },
    ]);
  });

  it("best times, best first, only valid slots", () => {
    expect(
      toBestTimes({
        slots: [
          { day_of_week: 1, hour: 9, avg_engagement: 10, post_count: 2 },
          { day_of_week: 5, hour: 0, avg_engagement: 40, post_count: 3 },
          { day_of_week: 9, hour: 0, avg_engagement: 99, post_count: 1 },
        ],
      }).map((s) => [s.dayOfWeek, s.hourUtc]),
    ).toEqual([
      [5, 0],
      [1, 9],
    ]);
  });

  it("demographics sorted by share; empty is null", () => {
    expect(
      toDemographics({
        demographics: {
          age: [
            { dimension: "18-24", value: 2 },
            { dimension: "25-34", value: 5 },
          ],
        },
      }),
    ).toEqual({
      age: [
        { key: "25-34", value: 5 },
        { key: "18-24", value: 2 },
      ],
    });
    expect(toDemographics({ demographics: {} })).toBeNull();
    expect(toDemographics({})).toBeNull();
  });

  it("online followers as 24 hours a day", () => {
    const o = toOnlineFollowers({
      days: [{ endTime: "2026-11-01T07:00:00Z", hours: { "0": 5, "23": 9 } }],
    });
    expect(o?.days[0].hours).toHaveLength(24);
    expect(o?.days[0].hours[23]).toBe(9);
    expect(toOnlineFollowers({ days: [] })).toBeNull();
  });

  it("timeline sums platforms per day", () => {
    expect(
      toTimeline({
        timeline: [
          { date: "2026-10-27", platform: "instagram", reach: 10 },
          { date: "2026-10-27", platform: "facebook", reach: 5 },
          { date: "2026-10-26", platform: "instagram", reach: 3 },
        ],
      }).map((p) => [p.date, p.reach]),
    ).toEqual([
      ["2026-10-26", 3],
      ["2026-10-27", 15],
    ]);
  });
});
