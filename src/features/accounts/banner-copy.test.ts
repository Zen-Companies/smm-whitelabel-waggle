import { expect, it } from "vitest";
import { disconnectedDetails, reconnectBarCopy, timeAgo } from "./banner-copy";

const now = new Date("2026-11-09T12:00:00Z");

it("timeAgo", () => {
  expect(timeAgo("2026-11-09T11:59:40Z", now)).toBe("just now");
  expect(timeAgo("2026-11-09T11:59:00Z", now)).toBe("1 minute ago");
  expect(timeAgo("2026-11-09T09:00:00Z", now)).toBe("3 hours ago");
  expect(timeAgo("2026-11-07T11:00:00Z", now)).toBe("2 days ago");
});

it("disconnectedDetails leaves out what isn't known", () => {
  expect(
    disconnectedDetails({
      username: "beachater_test_page",
      waiting: 2,
      disconnectedAt: "2026-11-09T09:00:00Z",
      now,
    }),
  ).toBe("@beachater_test_page · 2 messages waiting · disconnected 3 hours ago");
  expect(disconnectedDetails({ username: null, waiting: 1, disconnectedAt: null, now })).toBe(
    "1 message waiting",
  );
  expect(disconnectedDetails({ username: null, waiting: 0, disconnectedAt: null, now })).toBe("");
});

it("reconnectBarCopy says what stopped and what it costs (T72)", () => {
  expect(
    reconnectBarCopy({
      platform: "Instagram",
      waiting: 3,
      disconnectedAt: "2026-11-07T11:00:00Z",
      now,
    }),
  ).toEqual({
    headline: "Instagram stopped connecting 2 days ago.",
    detail: "3 messages are waiting there. It takes about 30 seconds to fix.",
  });
  expect(
    reconnectBarCopy({ platform: "Facebook", waiting: 0, disconnectedAt: null, now }).detail,
  ).toBe("New messages there wait until you reconnect. It takes about 30 seconds to fix.");
});
