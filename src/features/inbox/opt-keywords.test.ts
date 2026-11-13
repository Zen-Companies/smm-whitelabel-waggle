import { describe, expect, it } from "vitest";
import { isOptKeyword } from "./opt-keywords";

describe("isOptKeyword (T83d)", () => {
  it("skips STOP and START on texting channels only", () => {
    expect(isOptKeyword("imessage", " stop ")).toBe(true);
    expect(isOptKeyword("rcs", "Unsubscribe.")).toBe(true);
    expect(isOptKeyword("sms", "START")).toBe(true);
    expect(isOptKeyword("instagram", "STOP")).toBe(false);
    expect(isOptKeyword("sms", "Please stop texting me about the order")).toBe(false);
    expect(isOptKeyword("rcs", null)).toBe(false);
  });
});
