import { describe, expect, it } from "vitest";
import { ANALYTICS_HOURLY_MS, due, periodWindow, postRow } from "./sync";

describe("periodWindow", () => {
  it("counts today in the period (UTC days, both ends inclusive)", () => {
    const now = new Date("2026-11-05T21:30:00Z");
    expect(periodWindow(7, now)).toEqual({ fromDate: "2026-10-30", toDate: "2026-11-05" });
    expect(periodWindow(30, now)).toEqual({ fromDate: "2026-10-07", toDate: "2026-11-05" });
  });
});

describe("due", () => {
  const now = new Date("2026-11-05T12:00:00Z");
  it("never synced is due", () => {
    expect(due(null, ANALYTICS_HOURLY_MS, now)).toBe(true);
  });
  it("due once the interval has passed", () => {
    expect(due("2026-11-05T11:30:00Z", ANALYTICS_HOURLY_MS, now)).toBe(false);
    expect(due("2026-11-05T11:00:00Z", ANALYTICS_HOURLY_MS, now)).toBe(true);
  });
});

it("postRow rounds numbers and caps the caption", () => {
  const row = postRow(
    "t1",
    {
      postId: "p",
      zernioPostId: null,
      platform: "instagram",
      publishedAt: null,
      caption: "x".repeat(3000),
      permalink: null,
      thumbnailUrl: null,
      format: "photo",
      isExternal: true,
      syncStatus: "pending",
      metrics: {
        impressions: 1.6,
        reach: 2.4,
        likes: 0,
        comments: 0,
        shares: 0,
        saves: 0,
        clicks: 0,
        views: 0,
        engagementRate: 4.567,
      },
    },
    "2026-11-05T00:00:00Z",
  );
  expect(row).toMatchObject({
    reach: 2,
    impressions: 2,
    engagement_rate: 4.57,
    sync_status: "pending",
  });
  expect(row.caption).toHaveLength(2000);
});
