import { describe, expect, it } from "vitest";
import { DM_REPLY_WINDOW_MS, policy, triage, type PolicyInput } from "./policy";

const now = new Date("2026-10-29T12:00:00Z");
const base: PolicyInput = {
  item: { kind: "comment" },
  classification: { category: "faq", confidence: 0.95 },
  draft: { needsHuman: false },
  tenant: { subscriptionStatus: "active", confidenceThreshold: 0.85 },
  account: { status: "active" },
  autonomyMode: "approve",
  lastCustomerMessageAt: null,
  now,
};
const dm = (lastAgoMs: number | null): Partial<PolicyInput> => ({
  item: { kind: "dm" },
  lastCustomerMessageAt: lastAgoMs === null ? null : new Date(now.getTime() - lastAgoMs),
});
const run = (overrides: Partial<PolicyInput>) => policy({ ...base, ...overrides });

describe("policy (TDD §11, in order)", () => {
  describe("1. tenant or account not active → pause", () => {
    it.each(["past_due", "canceled"] as const)("subscription %s", (subscriptionStatus) => {
      expect(run({ tenant: { ...base.tenant, subscriptionStatus } })).toEqual({
        decision: "pause",
        reason: "tenant_inactive",
      });
    });
    it("trialing counts as paying", () => {
      expect(run({ tenant: { ...base.tenant, subscriptionStatus: "trialing" } }).decision).toBe(
        "approve",
      );
    });
    it.each(["disconnected", "error"] as const)("account %s", (status) => {
      expect(run({ account: { status } })).toEqual({
        decision: "pause",
        reason: "account_inactive",
      });
    });
    it("comes before everything else, even spam", () => {
      expect(
        run({
          tenant: { ...base.tenant, subscriptionStatus: "canceled" },
          classification: { category: "spam", confidence: 1 },
        }).decision,
      ).toBe("pause");
    });
  });

  describe("2. spam → ignore", () => {
    it.each(["off", "approve", "auto"] as const)("whatever the mode (%s)", (autonomyMode) => {
      expect(run({ classification: { category: "spam", confidence: 0.99 }, autonomyMode })).toEqual(
        {
          decision: "ignore",
          reason: "spam",
        },
      );
    });
  });

  describe("3. owner's call → escalate", () => {
    it.each(["complaint", "unclear"] as const)("%s, even in auto mode", (category) => {
      expect(run({ classification: { category, confidence: 0.99 }, autonomyMode: "auto" })).toEqual(
        {
          decision: "escalate",
          reason: category,
        },
      );
    });
    it("mode off", () => {
      expect(run({ autonomyMode: "off" })).toEqual({ decision: "escalate", reason: "mode_off" });
    });
    it("draft needs a human", () => {
      expect(run({ draft: { needsHuman: true }, autonomyMode: "auto" })).toEqual({
        decision: "escalate",
        reason: "needs_human",
      });
    });
    it("no draft at all", () => {
      expect(run({ draft: null })).toEqual({ decision: "escalate", reason: "needs_human" });
    });
  });

  describe("4. confidence below the tenant threshold → escalate", () => {
    it("just below", () => {
      expect(run({ classification: { category: "faq", confidence: 0.849 } })).toEqual({
        decision: "escalate",
        reason: "low_confidence",
      });
    });
    it("exactly at the threshold passes", () => {
      expect(run({ classification: { category: "faq", confidence: 0.85 } }).decision).toBe(
        "approve",
      );
    });
    it("uses the tenant's own threshold", () => {
      const tenant = { ...base.tenant, confidenceThreshold: 0.6 };
      expect(run({ tenant, classification: { category: "lead", confidence: 0.7 } }).decision).toBe(
        "approve",
      );
    });
    it("comes before needs_human", () => {
      expect(
        run({ classification: { category: "faq", confidence: 0.5 }, draft: { needsHuman: true } })
          .reason,
      ).toBe("low_confidence");
    });
  });

  describe("5. DM outside the 24-hour window → escalate", () => {
    it("inside the window", () => {
      expect(run(dm(23 * 3600_000)).decision).toBe("approve");
    });
    it("exactly 24 hours is closed", () => {
      expect(run(dm(DM_REPLY_WINDOW_MS))).toEqual({
        decision: "escalate",
        reason: "dm_window_closed",
      });
    });
    it("no known customer message", () => {
      expect(run(dm(null)).reason).toBe("dm_window_closed");
    });
    it("comments have no window", () => {
      expect(run({ lastCustomerMessageAt: new Date(0) }).decision).toBe("approve");
    });
    it("applies in auto mode too", () => {
      expect(run({ ...dm(25 * 3600_000), autonomyMode: "auto" }).decision).toBe("escalate");
    });
  });

  describe("6-7. mode decides", () => {
    it("approve → wait for the owner", () => {
      expect(run({ autonomyMode: "approve" })).toEqual({
        decision: "approve",
        reason: "approval_required",
      });
    });
    it("auto → send", () => {
      expect(run({ autonomyMode: "auto" })).toEqual({ decision: "send", reason: "auto_send" });
    });
    it("auto works for leads and DMs inside the window", () => {
      expect(
        run({
          ...dm(60_000),
          classification: { category: "lead", confidence: 0.9 },
          autonomyMode: "auto",
        }).decision,
      ).toBe("send");
    });
  });

  describe("at send time: the owner's approval counts in approve mode", () => {
    const approved = { needsHuman: false, approvedByOwner: true };
    it("approve mode + owner approved → send", () => {
      expect(run({ draft: approved })).toEqual({ decision: "send", reason: "owner_approved" });
    });
    it("a DM whose window closed while waiting still escalates", () => {
      expect(run({ ...dm(DM_REPLY_WINDOW_MS + 1), draft: approved })).toEqual({
        decision: "escalate",
        reason: "dm_window_closed",
      });
    });
    it("a disconnected account still pauses, mode off still escalates", () => {
      expect(run({ draft: approved, account: { status: "disconnected" } }).decision).toBe("pause");
      expect(run({ draft: approved, autonomyMode: "off" })).toEqual({
        decision: "escalate",
        reason: "mode_off",
      });
    });
    it("auto mode doesn't need it", () => {
      expect(
        run({ draft: { needsHuman: false, approvedByOwner: false }, autonomyMode: "auto" }),
      ).toEqual({ decision: "send", reason: "auto_send" });
    });
  });
});

describe("replies paused by the owner (T27)", () => {
  const paused = {
    subscriptionStatus: "active" as const,
    confidenceThreshold: 0.85,
    repliesPaused: true,
  };
  it("auto mode waits for the owner instead of sending", () => {
    expect(run({ tenant: paused, autonomyMode: "auto" })).toEqual({
      decision: "approve",
      reason: "replies_paused",
    });
  });
  it("approve mode is unchanged: it already waits", () => {
    expect(run({ tenant: paused })).toEqual({ decision: "approve", reason: "approval_required" });
  });
  it("an owner-approved reply still decides send (the send step holds it until resumed)", () => {
    expect(run({ tenant: paused, draft: { needsHuman: false, approvedByOwner: true } })).toEqual({
      decision: "send",
      reason: "owner_approved",
    });
  });
  it("escalations are unchanged", () => {
    expect(run({ tenant: paused, draft: { needsHuman: true } }).decision).toBe("escalate");
  });
});

describe("triage (steps 1-4, before drafting)", () => {
  it("drafts faq/lead that pass", () => {
    expect(triage(base)).toEqual({ decision: "draft" });
  });
  it("returns the same pre-draft decisions as policy", () => {
    expect(triage({ ...base, classification: { category: "spam", confidence: 1 } }).decision).toBe(
      "ignore",
    );
    expect(triage({ ...base, autonomyMode: "off" }).decision).toBe("escalate");
    expect(triage({ ...base, account: { status: "error" } }).decision).toBe("pause");
  });
});
