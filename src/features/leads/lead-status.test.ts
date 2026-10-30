import { describe, expect, it } from "vitest";
import { leadReplied, leadStatusText, phoneHref } from "./lead-status";

describe("lead status", () => {
  it("says whether the person has been answered", () => {
    expect(leadReplied("sent")).toBe(true);
    expect(leadReplied("handled")).toBe(true);
    expect(leadStatusText("awaiting_approval")).toBe("Reply waiting for you");
    expect(leadStatusText("escalated")).toBe("For you");
    expect(leadStatusText("drafted")).toBe("Reply being written");
  });
});

describe("phoneHref", () => {
  it("makes a tel: link for phone numbers only", () => {
    expect(phoneHref("0917 555 0101")).toBe("tel:09175550101");
    expect(phoneHref("+63 917-555-0101")).toBe("tel:+639175550101");
    expect(phoneHref("ana@example.com")).toBeNull();
    expect(phoneHref("DM me")).toBeNull();
    expect(phoneHref(null)).toBeNull();
  });
});
