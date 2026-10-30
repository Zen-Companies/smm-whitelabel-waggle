import { describe, expect, it } from "vitest";
import type { PreviewResult } from "./engine";
import { practiceCard, thenText, triesLeftText } from "./practice-copy";

const result = (over: Partial<PreviewResult>): PreviewResult => ({
  classification: { category: "faq", confidence: 0.93, provider: "jev", model: "jevos-v5" },
  triage: { decision: "draft" },
  facts: [
    { id: "1", title: "Opening hours", similarity: 0.8 },
    { id: "2", title: "Location", similarity: 0.4 },
  ],
  draft: { reply: "We open at 8am on Sundays!", needsHuman: false },
  groundingIssues: [],
  policy: { decision: "approve", reason: "approval_required" },
  reachedStep: "policy",
  error: null,
  timings: { classifyMs: 1, draftMs: 1 },
  ...over,
});

describe("practiceCard", () => {
  it("a covered question: the reply, the info it used and what happens next", () => {
    expect(practiceCard(result({}))).toEqual({
      looksLike: "a question",
      category: "faq",
      reply: "We open at 8am on Sundays!",
      basedOn: "Opening hours",
      leadDetails: null,
      next: "I'd ask you first: your setting for questions is Ask me first.",
      offerAddAnswer: false,
      tone: "reply",
    });
  });

  it("auto-send says so", () => {
    expect(practiceCard(result({ policy: { decision: "send", reason: "auto_send" } })).next).toBe(
      "I'd send this on my own: your setting for questions is Auto-send.",
    );
  });

  it("not covered by the info: no reply, offer to add an answer", () => {
    const card = practiceCard(
      result({
        draft: { reply: "Let me check with the team!", needsHuman: true },
        policy: { decision: "escalate", reason: "needs_human" },
      }),
    );
    expect(card).toMatchObject({
      reply: null,
      offerAddAnswer: true,
      next: "I'd pass this to you: your business info doesn't answer it.",
      tone: "owner",
    });
  });

  it("over this month's AI allowance: sorted, passed on without a reply (T32)", () => {
    const card = practiceCard(
      result({
        triage: { decision: "escalate", reason: "ai_cap_reached" },
        facts: null,
        draft: null,
        policy: null,
        reachedStep: "triage",
      }),
    );
    expect(card).toMatchObject({ looksLike: "a question", reply: null, tone: "owner" });
    expect(card.next).toContain("this month's AI allowance");
  });

  it("complaints always come to the owner", () => {
    const card = practiceCard(
      result({
        classification: { category: "complaint", confidence: 0.9, provider: "jev", model: "m" },
        triage: { decision: "escalate", reason: "complaint" },
        facts: null,
        draft: null,
        policy: null,
      }),
    );
    expect(card).toMatchObject({
      looksLike: "a complaint",
      reply: null,
      next: "Complaints always come to you. I never reply to these on my own.",
    });
  });

  it("spam, low confidence, mode off and a failure in plain words", () => {
    const triageOnly = (triage: PreviewResult["triage"]) =>
      practiceCard(result({ triage, facts: null, draft: null, policy: null })).next;
    expect(triageOnly({ decision: "ignore", reason: "spam" })).toBe(
      "I'd leave it alone. Spam doesn't show in your inbox.",
    );
    expect(triageOnly({ decision: "escalate", reason: "low_confidence" })).toBe(
      "I'm not sure what this is, so I'd pass it to you.",
    );
    expect(triageOnly({ decision: "escalate", reason: "mode_off" })).toBe(
      "Replies for questions are off, so I'd pass it to you.",
    );
    expect(practiceCard(result({ error: { step: "classify", message: "x" } })).tone).toBe("error");
  });

  it("a buyer's try shows what would be saved to Leads", () => {
    const card = practiceCard(
      result({
        classification: { category: "lead", confidence: 0.9, provider: "jev", model: "m" },
        draft: {
          reply: "Our team will confirm!",
          needsHuman: false,
          lead: { name: "Carlo", request: "Table for 8, Saturday" },
        },
      }),
    );
    expect(card.leadDetails).toBe("Carlo · Table for 8, Saturday");
    expect(card.basedOn).toBe("Opening hours");
  });

  it("never shows scores or model names", () => {
    const text = JSON.stringify(practiceCard(result({})));
    expect(text).not.toMatch(/0\.93|jevos|jev|approval_required/);
  });

  it("counts tries left", () => {
    expect(triesLeftText(20)).toBe("20 tries left today");
    expect(triesLeftText(1)).toBe("1 try left today");
    expect(triesLeftText(0)).toBe("No tries left today. More tomorrow.");
  });
});

describe("thenText", () => {
  it("says what happened to a real message", () => {
    expect(thenText("sent", { decidedByOwner: true, edited: false })).toBe(
      "Then: you approved the suggested reply",
    );
    expect(thenText("sent", { decidedByOwner: true, edited: true })).toBe(
      "Then: you edited the reply",
    );
    expect(thenText("sent", { decidedByOwner: false, edited: false })).toBe(
      "Then: sent on its own",
    );
    expect(thenText("escalated", null)).toBe("Then: it came to you");
    expect(thenText("ignored", null)).toBe("Then: hidden as spam");
    expect(thenText("new", null)).toBe("Then: still being sorted");
  });
});
