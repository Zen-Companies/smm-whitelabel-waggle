import { describe, expect, it } from "vitest";
import { defaultReplyVia, privateReplyClosesAt, privateReplyLeft } from "./private-reply";

describe("defaultReplyVia (T41)", () => {
  it("answers a lead's comment in DM, everything else where it was written", () => {
    expect(defaultReplyVia("comment", "lead")).toBe("dm");
    expect(defaultReplyVia("comment", "faq")).toBe("public");
    expect(defaultReplyVia("dm", "lead")).toBe("public");
    expect(defaultReplyVia("comment", null)).toBe("public");
  });

  it("answers in DM only where the platform allows it (Meta)", () => {
    expect(defaultReplyVia("comment", "lead", "instagram")).toBe("dm");
    expect(defaultReplyVia("comment", "lead", "tiktok")).toBe("public");
    expect(defaultReplyVia("comment", "lead", "threads")).toBe("public");
  });
});

describe("the 7-day private reply window", () => {
  const received = "2026-11-01T10:00:00Z";
  it("closes 7 days after the comment", () => {
    expect(privateReplyClosesAt(received).toISOString()).toBe("2026-11-08T10:00:00.000Z");
  });
  it("says how long is left, in days, then hours", () => {
    expect(privateReplyLeft(received, new Date("2026-11-01T11:00:00Z"))).toBe(
      "6 days left to reply in DM",
    );
    expect(privateReplyLeft(received, new Date("2026-11-07T09:00:00Z"))).toBe(
      "1 day left to reply in DM",
    );
    expect(privateReplyLeft(received, new Date("2026-11-08T05:30:00Z"))).toBe(
      "4 h left to reply in DM",
    );
    expect(privateReplyLeft(received, new Date("2026-11-08T09:30:00Z"))).toBe(
      "Under 1 h left to reply in DM",
    );
    expect(privateReplyLeft(received, new Date("2026-11-08T10:00:00Z"))).toBe(
      "Too late to reply in DM",
    );
  });
});
