import { describe, expect, it } from "vitest";
import { planPeek, type PeekInput } from "./plan-peek";

const base: PeekInput = {
  state: { kind: "free", used: 32, allowance: 100 },
  planName: "Free",
  planId: "free",
  renews: null,
  replies: { used: 32, allowance: 100, resets: "Dec 1" },
  accounts: { connected: 1, allowance: 1, paid: false },
  brands: { count: 1, limit: 1 },
  autoReplyIncluded: false,
  autoCategories: [],
  accountUsd: 10,
};

const solo: PeekInput = {
  ...base,
  state: { kind: "plan", planName: "Solo", used: 212, allowance: 300 },
  planName: "Solo",
  planId: "solo",
  renews: "Dec 18",
  replies: { used: 212, allowance: 300, resets: "Dec 18" },
  accounts: { connected: 2, allowance: 3, paid: true },
  autoReplyIncluded: true,
  autoCategories: ["faq"],
};

describe("planPeek", () => {
  it("Free: three rows, replies on their own not included, Upgrade", () => {
    const p = planPeek(base);
    expect(p.title).toBe("Free");
    expect(p.rows.map((r) => r.name)).toEqual(["Accounts", "Businesses", "Replies on their own"]);
    expect(p.rows[0]).toEqual({ name: "Accounts", value: "1 of 1 connected", note: undefined });
    expect(p.rows[2]).toMatchObject({ value: "Not on Free", quiet: true });
    expect(p.action).toEqual({ kind: "upgrade" });
    expect(p.note).toBeNull();
  });

  it("Solo: renews, extra accounts priced, auto on for questions, no action", () => {
    const p = planPeek(solo);
    expect(p.title).toBe("Solo · renews Dec 18");
    expect(p.rows[0].note).toBe("Then $10 each");
    expect(p.rows[2].value).toBe("On for Questions");
    expect(p.action).toEqual({ kind: "none" });
  });

  it("auto off on a plan that includes it, and both categories", () => {
    expect(planPeek({ ...solo, autoCategories: [] }).rows[2].value).toBe("Off");
    expect(planPeek({ ...solo, autoCategories: ["lead", "faq", "complaint"] }).rows[2].value).toBe(
      "On for Questions and Leads",
    );
  });

  it("no business limit says so; Business (by call) talks to Jason", () => {
    const p = planPeek({
      ...solo,
      planId: "team",
      planName: "Business",
      brands: { count: 6, limit: null },
    });
    expect(p.rows[1]).toEqual({ name: "Businesses", value: "6", note: "No limit" });
    expect(p.action).toEqual({ kind: "call" });
  });

  it("out of replies: Free upgrades, a paid plan tops up, auto is paused", () => {
    const free = planPeek({ ...base, state: { kind: "reached", free: true } });
    expect(free.title).toBe("Free · replies used up");
    expect(free.action).toEqual({ kind: "upgrade" });
    expect(free.note).toMatch(/still come in/);
    const paid = planPeek({ ...solo, state: { kind: "reached" } });
    expect(paid.action).toEqual({ kind: "top_up" });
    expect(paid.rows[2]).toMatchObject({ value: "Paused", quiet: true });
  });

  it("card declined and a trial", () => {
    const due = planPeek({ ...solo, state: { kind: "past_due" } });
    expect(due.title).toBe("Solo · card declined");
    expect(due.action).toEqual({ kind: "update_card" });
    const trial = planPeek({ ...solo, state: { kind: "trial", planName: "Solo", daysLeft: 1 } });
    expect(trial.title).toBe("Solo · free trial, 1 day left");
  });
});
