import { describe, expect, it } from "vitest";
import type { PreviewResult } from "./engine";
import { practiceCard, triesLeftText } from "./practice-copy";

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
      usedInfo: ["Opening hours", "Location"],
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
