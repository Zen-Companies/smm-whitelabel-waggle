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

  describe("2. spam: never answered (T40)", () => {
    const spam = { classification: { category: "spam" as const, confidence: 0.99 } };
    it.each(["off", "approve", "auto"] as const)(
      "a spam DM is ignored, whatever the mode (%s)",
      (autonomyMode) => {
        expect(run({ ...spam, ...dm(1000), autonomyMode })).toEqual({
          decision: "ignore",
          reason: "spam",
        });
      },
    );
    it("a spam comment comes to the owner to hide, since it is public on the post", () => {
      expect(run(spam)).toEqual({ decision: "escalate", reason: "spam" });
    });
    it.each(["off", "approve", "auto"] as const)(
      "with auto-hide on, a spam comment is hidden, whatever the mode (%s)",
      (autonomyMode) => {
        expect(
          run({ ...spam, autonomyMode, tenant: { ...base.tenant, autoHideSpam: true } }),
        ).toEqual({ decision: "hide", reason: "spam" });
      },
    );
    it("auto-hide only when Waggle is sure; otherwise the owner decides", () => {
      expect(
        run({
          classification: { category: "spam", confidence: 0.6 },
          tenant: { ...base.tenant, autoHideSpam: true },
        }),
      ).toEqual({ decision: "escalate", reason: "spam" });
    });
    it("auto-hide never applies to DMs (they can't be hidden)", () => {
      expect(run({ ...spam, ...dm(1000), tenant: { ...base.tenant, autoHideSpam: true } })).toEqual(
        { decision: "ignore", reason: "spam" },
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

describe("Facebook reviews (T42)", () => {
  const review = { item: { kind: "review" as const } };
  it.each(["approve", "auto"] as const)(
    "a review reply always waits for the owner, even in %s mode",
    (autonomyMode) => {
      expect(run({ ...review, autonomyMode })).toEqual({
        decision: "approve",
        reason: "review_public",
      });
    },
  );
  it("goes out once the owner approved it", () => {
    expect(run({ ...review, draft: { needsHuman: false, approvedByOwner: true } })).toEqual({
      decision: "send",
      reason: "owner_approved",
    });
  });
  it("a spam review is ignored (reviews can't be hidden)", () => {
    expect(
      run({
        ...review,
        classification: { category: "spam", confidence: 0.99 },
        tenant: { ...base.tenant, autoHideSpam: true },
      }),
    ).toEqual({ decision: "ignore", reason: "spam" });
  });
  it("a negative review is a complaint like any other: the owner's call", () => {
    expect(run({ ...review, classification: { category: "complaint", confidence: 0.9 } })).toEqual({
      decision: "escalate",
      reason: "complaint",
    });
  });
});

describe("triage (steps 1-4, before drafting)", () => {
  it("drafts faq/lead that pass", () => {
    expect(triage(base)).toEqual({ decision: "draft" });
  });
  it("returns the same pre-draft decisions as policy", () => {
    expect(
      triage({ ...base, ...dm(1000), classification: { category: "spam", confidence: 1 } })
        .decision,
    ).toBe("ignore");
    expect(triage({ ...base, autonomyMode: "off" }).decision).toBe("escalate");
    expect(triage({ ...base, account: { status: "error" } }).decision).toBe("pause");
  });
});

describe("monthly AI spend cap (T32)", () => {
  it("still sorts messages but drafts nothing: they come to the owner", () => {
    expect(triage({ ...base, aiCapReached: true })).toEqual({
      decision: "escalate",
      reason: "ai_cap_reached",
    });
    expect(
      triage({
        ...base,
        ...dm(1000),
        aiCapReached: true,
        classification: { category: "spam", confidence: 1 },
      }),
    ).toEqual({ decision: "ignore", reason: "spam" });
    expect(triage({ ...base, aiCapReached: false })).toEqual({ decision: "draft" });
  });
  it("a reply already drafted isn't held back by the cap", () => {
    expect(policy(base).decision).toBe("approve");
  });
});

describe("the owner's own reply to a message handed to them (MCP Q1)", () => {
  const own = { needsHuman: true, approvedByOwner: true, writtenByOwner: true };
  it.each(["complaint", "unclear", "spam"] as const)(
    "%s: sent on the owner's say-so",
    (category) => {
      expect(run({ classification: { category, confidence: 0.4 }, draft: own })).toEqual({
        decision: "send",
        reason: "owner_approved",
      });
    },
  );
  it("sent even with replies off or paused", () => {
    expect(
      run({ autonomyMode: "off", tenant: { ...base.tenant, repliesPaused: true }, draft: own })
        .decision,
    ).toBe("send");
  });
  it("hard limits still apply: unpaid, account down, DM window closed", () => {
    expect(run({ tenant: { ...base.tenant, subscriptionStatus: "canceled" }, draft: own })).toEqual(
      { decision: "pause", reason: "tenant_inactive" },
    );
    expect(run({ account: { status: "disconnected" }, draft: own })).toEqual({
      decision: "pause",
      reason: "account_inactive",
    });
    expect(run({ ...dm(DM_REPLY_WINDOW_MS + 1), draft: own })).toEqual({
      decision: "escalate",
      reason: "dm_window_closed",
    });
    expect(run({ ...dm(60_000), draft: own }).decision).toBe("send");
  });
  it("written but not approved yet (undone): the usual rules", () => {
    expect(
      run({
        classification: { category: "complaint", confidence: 0.9 },
        draft: { ...own, approvedByOwner: false },
      }),
    ).toEqual({ decision: "escalate", reason: "complaint" });
  });
});
