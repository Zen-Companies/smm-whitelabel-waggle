import { describe, expect, it } from "vitest";
import type { ProviderReview } from "@/lib/social/types";
import { newReviews, REVIEWS_POLL_INTERVAL_MS, reviewsDue } from "./reviews";

const review = (over: Partial<ProviderReview>): ProviderReview => ({
  id: "rev",
  reviewerName: "Lara",
  recommends: false,
  text: "Waited 40 minutes.",
  createdAt: "2026-11-05T10:00:00Z",
  hasReply: false,
  reviewUrl: null,
  ...over,
});

describe("newReviews (T42)", () => {
  it("keeps unanswered reviews written since the Page was connected", () => {
    const reviews = [
      review({ id: "new" }),
      review({ id: "answered", hasReply: true }),
      review({ id: "old", createdAt: "2026-10-01T10:00:00Z" }),
    ];
    expect(newReviews(reviews, "2026-11-01T00:00:00Z").map((r) => r.id)).toEqual(["new"]);
  });
});

describe("reviewsDue", () => {
  const now = new Date("2026-11-05T10:00:00Z");
  it("reads a Page never read, or not read for the interval", () => {
    expect(reviewsDue(null, now)).toBe(true);
    expect(reviewsDue(new Date(now.getTime() - REVIEWS_POLL_INTERVAL_MS).toISOString(), now)).toBe(
      true,
    );
    expect(reviewsDue(new Date(now.getTime() - 60_000).toISOString(), now)).toBe(false);
  });
});
