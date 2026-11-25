import { describe, expect, it } from "vitest";
import type { BestTimeSlot } from "@/lib/social/analytics-types";
import { BEST_TIME_MIN_POSTS, bestChips, postsAnalyzed } from "./best-chips";

// Best-time chips (Posts Round 3, decision 3): 3 times from the brand's own past posts, only
// once about 10 posts are behind them; each the next such time, never within the hour.

const slot = (dayOfWeek: number, hourUtc: number, avgEngagement: number, postCount: number) =>
  ({ dayOfWeek, hourUtc, avgEngagement, postCount }) satisfies BestTimeSlot;

// Days are 0 = Monday. Manila is UTC+8: 11:00 UTC Thursday is 7:00 PM Thursday there.
const slots = [
  slot(3, 11, 90, 4), // Thu 7 PM Manila
  slot(4, 4, 70, 3), // Fri 12 PM
  slot(5, 1, 60, 3), // Sat 9 AM
  slot(0, 0, 10, 2), // Mon 8 AM, fourth
];
const wedNoonManila = new Date("2026-11-25T04:00:00.000Z");

describe("best-time chips", () => {
  it("count the posts behind the analysis", () => {
    expect(postsAnalyzed(slots)).toBe(12);
    expect(postsAnalyzed(null)).toBe(0);
  });

  it("stay hidden until about 10 posts", () => {
    expect(BEST_TIME_MIN_POSTS).toBe(10);
    expect(bestChips([slot(3, 11, 90, 9)], wedNoonManila, "Asia/Manila")).toBeNull();
    expect(bestChips(null, wedNoonManila, "Asia/Manila")).toBeNull();
    expect(bestChips([slot(3, 11, 90, 10)], wedNoonManila, "Asia/Manila")).toHaveLength(1);
  });

  it("show the 3 best, each as its next time in the viewer's zone", () => {
    expect(bestChips(slots, wedNoonManila, "Asia/Manila")).toEqual([
      { label: "Thu 7:00 PM", day: "2026-11-26", time: "19:00" },
      { label: "Fri 12:00 PM", day: "2026-11-27", time: "12:00" },
      { label: "Sat 9:00 AM", day: "2026-11-28", time: "09:00" },
    ]);
  });

  it("never offer a time within the next hour: it goes to next week", () => {
    const wed645pm = new Date("2026-11-25T10:45:00.000Z"); // Wed 6:45 PM Manila
    const wedSeven = [slot(2, 11, 90, 12)]; // Wed 7 PM Manila
    expect(bestChips(wedSeven, wed645pm, "Asia/Manila")).toEqual([
      { label: "Wed 7:00 PM", day: "2026-12-02", time: "19:00" },
    ]);
  });
});
