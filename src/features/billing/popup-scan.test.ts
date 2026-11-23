import { describe, expect, it } from "vitest";
import { scanNumbers, wantsToBuy } from "./popup-scan";

const CLOSED = ["sent", "handled", "rejected", "ignored"];

describe("wantsToBuy", () => {
  it("a Jev lead, or a price or order question", () => {
    expect(wantsToBuy("hi", "lead")).toBe(true);
    expect(wantsToBuy("how much is the latte?", "faq")).toBe(true);
    expect(wantsToBuy("can I order a cake for saturday", null)).toBe(true);
    expect(wantsToBuy("are you open today?", "faq")).toBe(false);
    expect(wantsToBuy("how much?? scam", "spam")).toBe(false);
    expect(wantsToBuy("refund my order", "complaint")).toBe(false);
  });
});

describe("scanNumbers", () => {
  it("counts open buyers, locked conversations (no spam) and answered by kind", () => {
    const n = scanNumbers(
      [
        { kind: "dm", category: "lead", status: "awaiting_approval", text: "x" },
        { kind: "comment", category: "faq", status: "escalated", text: "price?" },
        { kind: "comment", category: "faq", status: "sent", text: "price?" },
        { kind: "dm", category: "faq", status: "sent", text: "hours" },
      ],
      [
        { conversation: "c1", category: null, text: "how much" },
        { conversation: "c1", category: "faq", text: "hello" },
        { conversation: "c2", category: "spam", text: "buy followers" },
        { conversation: "c3", category: "faq", text: "where are you" },
      ],
      CLOSED,
    );
    expect(n).toEqual({ buyers: 3, lockedDms: 2, answeredDms: 1, answeredComments: 1 });
  });
});
