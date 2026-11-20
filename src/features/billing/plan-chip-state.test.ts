import { describe, expect, it } from "vitest";
import { planChipState, planChipText, showOnPhone } from "./plan-chip-state";

const now = new Date("2026-11-18T10:00:00Z");
const base = {
  status: "active",
  planName: "Team",
  trialEndsAt: null,
  replies: { used: 620, allowance: 750 },
  now,
  stripeOn: true,
};

describe("planChipState", () => {
  it("a trial shows its days left", () => {
    const s = planChipState({ ...base, status: "trialing", trialEndsAt: "2026-11-24T09:00:00Z" })!;
    expect(s).toEqual({ kind: "trial", planName: "Team", daysLeft: 6 });
    expect(planChipText(s)).toBe("Team trial · 6 days left");
    expect(planChipText(s, true)).toBe("6 days left");
  });

  it("a plan shows its name and replies, quietly (not on the phone)", () => {
    const s = planChipState(base)!;
    expect(s).toEqual({ kind: "plan", planName: "Team", used: 620, allowance: 750 });
    expect(showOnPhone(s)).toBe(false);
  });

  it("a failed payment comes before replies; replies used up before the trial", () => {
    expect(planChipState({ ...base, status: "past_due" })?.kind).toBe("past_due");
    expect(
      planChipState({
        ...base,
        status: "trialing",
        trialEndsAt: "2026-11-24T09:00:00Z",
        replies: { used: 200, allowance: 200 },
      })?.kind,
    ).toBe("reached");
  });

  it("no paid plan is Free (19 Nov): its replies, and Upgrade to Solo when they run out", () => {
    const free = planChipState({
      ...base,
      planName: null,
      status: null,
      replies: { used: 12, allowance: 100 },
    })!;
    expect(free).toEqual({ kind: "free", used: 12, allowance: 100 });
    expect(planChipText(free)).toBe("Free · Upgrade");
    const out = planChipState({
      ...base,
      planName: null,
      status: null,
      replies: { used: 100, allowance: 100 },
    })!;
    expect(out).toEqual({ kind: "reached", free: true });
    expect(planChipText(out)).toBe("Replies used up · Upgrade to Solo");
    // A test brand's organization has no counted replies: no chip.
    expect(planChipState({ ...base, planName: null, status: null, replies: null })).toBeNull();
  });

  it("words for every state", () => {
    expect(planChipText({ kind: "reached" })).toBe("Replies used up · Add 200 for $15");
    expect(planChipText({ kind: "past_due" }, true)).toBe("Update card");
    expect(planChipText({ kind: "trial", planName: "Solo", daysLeft: 1 }, true)).toBe("1 day left");
  });
});
