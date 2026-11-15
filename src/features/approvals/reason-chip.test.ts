import { describe, expect, it } from "vitest";
import { draftReason, reasonChip } from "./reason-chip";

const entry = (over: Partial<Parameters<typeof reasonChip>[0]>) => ({
  status: "escalated",
  kind: "dm",
  text: "Hello?",
  category: null,
  draft: null,
  ...over,
});

describe("reason chips (T71, T72)", () => {
  it("says why a message came to the owner", () => {
    expect(reasonChip(entry({ category: "complaint" }))).toBe("Upset customer");
    expect(reasonChip(entry({ status: "failed", category: "complaint" }))).toBe("Couldn't send");
    expect(reasonChip(entry({ text: "  " }))).toBe("Sent a photo");
    expect(reasonChip(entry({ draft: { needsHuman: true } }))).toBe("Not in your answers");
    expect(reasonChip(entry({ kind: "review", reviewRating: 1 }))).toBe("Upset customer");
    expect(reasonChip(entry({ kind: "call", call: { voicemail: true } }))).toBe("Voicemail");
    expect(reasonChip(entry({ category: "unclear" }))).toBe("Not sure what they want");
    expect(reasonChip(entry({}))).toBe("For you");
  });

  it("tags a reply waiting for approval and says why it waited", () => {
    expect(draftReason({ kind: "dm", category: "lead" })).toEqual({
      tag: "New lead",
      why: "You asked to check these first.",
      urgent: false,
    });
    expect(draftReason({ kind: "review", category: null, reviewRating: 1 })).toMatchObject({
      tag: "Unhappy review",
      urgent: true,
    });
    expect(draftReason({ kind: "comment", category: "complaint" }).urgent).toBe(true);
  });
});
