import { describe, expect, it } from "vitest";
import { googleBusinessLine, NO_NUMBERS, platformLine } from "./platform-words";

const totals = {
  impressions: 1020,
  reach: 900,
  likes: 610,
  comments: 38,
  shares: 12,
  saves: 4,
  clicks: 30,
  views: 7420,
  engagementRate: 4.1,
};

describe("platformLine", () => {
  it("uses each app's own words, only for what it shares", () => {
    expect(platformLine("tiktok", totals, 40)).toEqual([
      { label: "Views", value: 7420 },
      { label: "Likes", value: 610 },
      { label: "Comments", value: 38 },
      { label: "Shares", value: 12 },
      { label: "Followers", value: 40, delta: true },
    ]);
    expect(platformLine("youtube", totals, 4).map((m) => m.label)).toEqual([
      "Views",
      "Likes",
      "Comments",
      "Subscribers",
    ]);
    expect(platformLine("bluesky", totals, null).map((m) => m.label)).toEqual([
      "Likes",
      "Replies",
      "Reposts",
    ]);
    expect(platformLine("linkedin", totals, null).map((m) => m.label)).toEqual([
      "Impressions",
      "Reactions",
      "Comments",
      "Reposts",
    ]);
    expect(platformLine("pinterest", totals, null).map((m) => m.label)).toEqual([
      "Impressions",
      "Saves",
      "Pin clicks",
    ]);
    expect(platformLine("threads", totals, null).map((m) => m.label)).toEqual([
      "Views",
      "Likes",
      "Replies",
      "Reposts",
    ]);
  });

  it("platforms with no numbers say so instead of zeros", () => {
    expect(platformLine("telegram", totals, null)).toEqual([]);
    expect(NO_NUMBERS.has("whatsapp")).toBe(true);
    expect(NO_NUMBERS.has("telegram")).toBe(true);
  });
});

describe("googleBusinessLine", () => {
  it("adds up search and maps views, then calls, directions, website clicks", () => {
    expect(
      googleBusinessLine({
        BUSINESS_IMPRESSIONS_DESKTOP_MAPS: 100,
        BUSINESS_IMPRESSIONS_MOBILE_MAPS: 300,
        BUSINESS_IMPRESSIONS_DESKTOP_SEARCH: 160,
        BUSINESS_IMPRESSIONS_MOBILE_SEARCH: 300,
        CALL_CLICKS: 14,
        BUSINESS_DIRECTION_REQUESTS: 31,
        WEBSITE_CLICKS: 22,
      }),
    ).toEqual([
      { label: "Profile views", value: 860 },
      { label: "Calls", value: 14 },
      { label: "Directions", value: 31 },
      { label: "Website clicks", value: 22 },
    ]);
  });

  it("bookings and messages only when there are some", () => {
    const line = googleBusinessLine({ BUSINESS_BOOKINGS: 3, BUSINESS_CONVERSATIONS: 0 });
    expect(line.map((m) => m.label)).toEqual([
      "Profile views",
      "Calls",
      "Directions",
      "Website clicks",
      "Bookings",
    ]);
  });
});
