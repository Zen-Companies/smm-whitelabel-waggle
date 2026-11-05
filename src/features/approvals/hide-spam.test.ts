import { describe, expect, it } from "vitest";
import { SocialProviderError } from "@/lib/social/types";
import { hideErrorOutcome } from "./hide-spam";

const err = (details: ConstructorParameters<typeof SocialProviderError>[1]) =>
  new SocialProviderError("Zernio hideComment failed", details);

describe("hideErrorOutcome (T40)", () => {
  it("a 400 PLATFORM_API_ERROR means the comment is gone: nothing to hide, don't retry", () => {
    expect(
      hideErrorOutcome(err({ status: 400, code: "PLATFORM_API_ERROR", ambiguous: false })),
    ).toBe("gone");
  });
  it("anything else is a failure to try again", () => {
    expect(
      hideErrorOutcome(err({ status: 400, code: "PLATFORM_LIMITATION", ambiguous: false })),
    ).toBe("failed");
    expect(hideErrorOutcome(err({ status: 503, ambiguous: true }))).toBe("failed");
    expect(hideErrorOutcome(err({ status: 429, ambiguous: false, retryAfterSeconds: 5 }))).toBe(
      "failed",
    );
    expect(hideErrorOutcome(err({ ambiguous: true }))).toBe("failed");
    expect(hideErrorOutcome(new Error("boom"))).toBe("failed");
  });
});
