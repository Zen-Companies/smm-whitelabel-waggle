import { expect, it } from "vitest";
import { activitySubject, mergeActivity, snippet, type ActivityEntry } from "./today-activity";

const e = (itemId: string, what: ActivityEntry["what"], at: string): ActivityEntry => ({
  itemId,
  what,
  kind: "dm",
  authorName: "Jun R.",
  text: "hi",
  at,
});

it("mergeActivity: newest first, capped", () => {
  const out = mergeActivity(
    [e("a1", "answered", "2026-11-09T09:00:00Z"), e("a2", "answered", "2026-11-09T14:00:00Z")],
    [e("i1", "ignored", "2026-11-09T11:00:00Z")],
    2,
  );
  expect(out.map((x) => x.itemId)).toEqual(["a2", "i1"]);
});

it("activitySubject names the customer of an answer, never of ignored spam", () => {
  expect(activitySubject({ kind: "dm", authorName: "Jun R.", what: "answered" })).toBe(
    "a DM from Jun R.",
  );
  expect(activitySubject({ kind: "comment", authorName: " ", what: "answered" })).toBe("a comment");
  expect(activitySubject({ kind: "comment", authorName: "spammer", what: "ignored" })).toBe(
    "a comment",
  );
});

it("snippet keeps one line and cuts long text", () => {
  expect(snippet("do you\n take   reservations?")).toBe("do you take reservations?");
  expect(snippet("x".repeat(80), 10)).toBe(`${"x".repeat(9)}…`);
});
