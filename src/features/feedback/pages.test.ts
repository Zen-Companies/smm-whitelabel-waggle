import { describe, expect, it } from "vitest";
import { nudgesAllowed } from "./nudge-rules";
import { FOLLOW_UP, pageInfo } from "./pages";

describe("pageInfo", () => {
  it("names the page and never keeps ids or queries", () => {
    expect(pageInfo("/analytics?period=30")).toMatchObject({
      page: "analytics",
      name: "Analytics",
    });
    expect(pageInfo("/inbox/items/123")).toMatchObject({ page: "inbox", name: "Inbox" });
    expect(pageInfo("/knowledge-base")).toMatchObject({ name: "Business info" });
    expect(pageInfo("/somewhere-new")).toMatchObject({ page: "other", name: "Waggle" });
  });
});

describe("FOLLOW_UP", () => {
  it("asks an open question, never a scale", () => {
    expect(FOLLOW_UP.problem).toBe("What did you expect instead?");
    expect(FOLLOW_UP.question).toBeNull();
  });
});

describe("nudgesAllowed", () => {
  const now = new Date("2026-11-12T10:00:00Z");
  const ago = (min: number) => new Date(now.getTime() - min * 60_000);
  const base = { createdAt: ago(60 * 24 * 3), shown: [], lastFeedbackAt: null };

  it("allows a nudge for a settled login", () => {
    expect(nudgesAllowed(base, now)).toBe(true);
  });
  it("waits 10 minutes after sign-up", () => {
    expect(nudgesAllowed({ ...base, createdAt: ago(5) }, now)).toBe(false);
  });
  it("shows at most one a day", () => {
    expect(nudgesAllowed({ ...base, shown: [{ at: ago(60), dismissed: false }] }, now)).toBe(false);
  });
  it("rests 7 days after feedback", () => {
    expect(nudgesAllowed({ ...base, lastFeedbackAt: ago(60 * 24 * 2) }, now)).toBe(false);
  });
  it("stops for 30 days after three Not nows", () => {
    const no = [2, 5, 9].map((d) => ({ at: ago(60 * 24 * d), dismissed: true }));
    expect(nudgesAllowed({ ...base, shown: no }, now)).toBe(false);
  });
});
