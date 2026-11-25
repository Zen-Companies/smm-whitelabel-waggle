import { describe, expect, it } from "vitest";
import { canDropOn, canMove, moveProblem, moveToDay } from "./move";

// Drag to move (Posts Round 3): the post keeps its time, the day changes; never into the past.

describe("moving a planned post", () => {
  const now = new Date("2026-11-25T04:00:00.000Z"); // Wed 25, 12:00 PM in Manila
  const friNine = "2026-11-27T01:00:00.000Z"; // Fri 27, 9:00 AM in Manila

  it("only planned posts the platforms hold can move", () => {
    expect(canMove({ status: "scheduled", zernio_post_id: "p1" })).toBe(true);
    expect(canMove({ status: "scheduled", zernio_post_id: null })).toBe(false);
    expect(canMove({ status: "published", zernio_post_id: "p1" })).toBe(false);
    expect(canMove({ status: "publishing", zernio_post_id: "p1" })).toBe(false);
    expect(canMove({ status: "queued", zernio_post_id: null })).toBe(false);
  });

  it("keeps the time of day in the viewer's zone", () => {
    expect(moveToDay(friNine, "2026-11-26", "Asia/Manila").toISOString()).toBe(
      "2026-11-26T01:00:00.000Z",
    );
    // The same instant is 8:00 PM the day before in New York: it stays 8:00 PM there.
    expect(moveToDay(friNine, "2026-11-30", "America/New_York").toISOString()).toBe(
      "2026-12-01T01:00:00.000Z",
    );
  });

  it("never moves into the past (or the next 5 minutes)", () => {
    expect(moveProblem(new Date("2026-11-24T01:00:00.000Z"), now)).toMatch(/already passed/);
    expect(moveProblem(new Date(now.getTime() + 60_000), now)).toMatch(/already passed/);
    expect(moveProblem(new Date(now.getTime() + 10 * 60_000), now)).toBeNull();
    expect(moveProblem(new Date("nope"), now)).toBe("Pick a day and time.");
  });

  it("a day can take the drop only when the moved time is still ahead", () => {
    const post = { scheduled_for: friNine };
    expect(canDropOn(post, "2026-11-26", "Asia/Manila", now)).toBe(true);
    // Today at 9:00 AM already passed (it's noon).
    expect(canDropOn(post, "2026-11-25", "Asia/Manila", now)).toBe(false);
    expect(canDropOn(post, "2026-11-23", "Asia/Manila", now)).toBe(false);
    // Its own day isn't a move.
    expect(canDropOn(post, "2026-11-27", "Asia/Manila", now)).toBe(false);
    expect(canDropOn({ scheduled_for: null }, "2026-11-28", "Asia/Manila", now)).toBe(false);
  });
});
