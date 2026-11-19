import { describe, expect, it } from "vitest";
import { customerHandle, daysWaited, firstApprovalCopy, sendingCopy } from "./first-approval";

const now = new Date("2026-11-20T10:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000 - 60_000).toISOString();
const base = {
  author: "sarah.k",
  kind: "comment",
  receivedAt: daysAgo(9),
  now,
  used: 1,
  allowance: 100,
  free: true,
  waiting: 19,
  platform: "Instagram",
  nextHref: "/inbox/items/abc",
};

describe("firstApprovalCopy", () => {
  it("names a late comment's wait, in neutral words", () => {
    const copy = firstApprovalCopy(base);
    expect(copy.title).toBe("Done. @sarah.k got their answer 9 days late, but they got it.");
    expect(copy.usage).toBe("1 of 100 free replies used this month. 19 more drafts are waiting.");
    expect(copy.spaced).toBe(
      "Approve as fast as you like: Waggle sends them spaced out, so Instagram never sees a burst.",
    );
    expect(copy.nextHref).toBe("/inbox/items/abc");
  });

  it("never says late for a DM, or for a comment under 2 days", () => {
    expect(firstApprovalCopy({ ...base, kind: "dm" }).title).toBe(
      "Done. @sarah.k got their answer.",
    );
    expect(firstApprovalCopy({ ...base, receivedAt: daysAgo(1) }).title).toBe(
      "Done. @sarah.k got their answer.",
    );
    expect(firstApprovalCopy({ ...base, receivedAt: daysAgo(2) }).title).toContain("2 days late");
  });

  it("drops 'free' on a paid plan and the count when the plan has no limit", () => {
    expect(firstApprovalCopy({ ...base, free: false, allowance: 1000 }).usage).toBe(
      "1 of 1000 replies used this month. 19 more drafts are waiting.",
    );
    expect(firstApprovalCopy({ ...base, used: null, allowance: null }).usage).toBe(
      "19 more drafts are waiting.",
    );
  });

  it("says plainly when one or none is waiting, and drops the spacing note at none", () => {
    expect(firstApprovalCopy({ ...base, waiting: 1 }).usage).toContain("1 more draft is waiting.");
    const none = firstApprovalCopy({ ...base, waiting: 0 });
    expect(none.usage).toContain("No more drafts are waiting.");
    expect(none.spaced).toBeNull();
  });
});

describe("customerHandle", () => {
  it("shows a handle with @, a name as it is", () => {
    expect(customerHandle("sarah.k")).toBe("@sarah.k");
    expect(customerHandle("@sarah.k")).toBe("@sarah.k");
    expect(customerHandle("Ana Reyes")).toBe("Ana Reyes");
    expect(customerHandle(null)).toBe("Your customer");
  });
});

describe("daysWaited", () => {
  it("counts whole days", () => {
    expect(daysWaited(daysAgo(9), now)).toBe(9);
    expect(daysWaited(now.toISOString(), now)).toBe(0);
  });
});

describe("sendingCopy", () => {
  it("matches the board", () => {
    expect(sendingCopy({ current: 3, total: 20 }, "Instagram")).toEqual({
      title: "Sending 3 of 20…",
      line: "Waggle sends approved replies about every 20–30 seconds, so Instagram never sees a burst. You can close this page.",
    });
  });
});
