import { describe, expect, it } from "vitest";
import { SocialProviderError } from "@/lib/social/types";
import { failedSummary, retryErrorMessage, retryPath, statusAfterRetry } from "./retry";

// "Try again" (Posts round 1, 25 Nov): a post Zernio has is retried there, only on the
// platforms that didn't publish; nothing is ever sent twice to an account that has it.

const post = (status: string, zernio: string | null = "zp_1", reason: string | null = null) => ({
  status,
  zernio_post_id: zernio,
  failure_reason: reason,
});

describe("retryPath", () => {
  it("partial: Zernio's retry, never a new post or a new time", () => {
    expect(retryPath(post("partial"), false)).toBe("zernio_retry");
    expect(retryPath(post("partial"), true)).toBe("not_allowed");
    expect(retryPath(post("partial", null), false)).toBe("not_allowed");
  });

  it("failed: Zernio's retry when Zernio has it; sent again when it never took it or for a new time", () => {
    expect(retryPath(post("failed"), false)).toBe("zernio_retry");
    expect(retryPath(post("failed", "zp_1", "zernio_paused"), false)).toBe("zernio_retry");
    expect(retryPath(post("failed", null), false)).toBe("send_again");
    expect(retryPath(post("failed"), true)).toBe("send_again");
  });

  it("cancelled because its account was removed: sent again; taken down or plain cancelled: no", () => {
    expect(retryPath(post("cancelled", "zp_1", "account_removed"), false)).toBe("send_again");
    expect(retryPath(post("cancelled", "zp_1", "taken_down"), false)).toBe("not_allowed");
    expect(retryPath(post("cancelled"), false)).toBe("not_allowed");
    expect(retryPath(post("published"), false)).toBe("not_allowed");
  });
});

describe("after Zernio's retry", () => {
  it("maps the post's status", () => {
    expect(statusAfterRetry("published")).toBe("published");
    expect(statusAfterRetry("partial")).toBe("partial");
    expect(statusAfterRetry("failed")).toBe("failed");
    expect(statusAfterRetry("scheduled")).toBe("publishing");
    expect(statusAfterRetry("publishing")).toBe("publishing");
  });

  it("keeps the failed platforms' reasons as the row's error", () => {
    expect(
      failedSummary([
        { platform: "facebook", status: "published", url: "u", error: null },
        { platform: "instagram", status: "failed", url: null, error: "Unsupported format" },
      ]),
    ).toBe("instagram: Unsupported format");
    expect(
      failedSummary([{ platform: "facebook", status: "published", url: null, error: null }]),
    ).toBeNull();
  });
});

describe("retryErrorMessage", () => {
  const err = (details: ConstructorParameters<typeof SocialProviderError>[1]) =>
    new SocialProviderError("x", details);

  it("a 5xx or timeout: wait for the platforms to answer, never press again blind", () => {
    expect(retryErrorMessage(err({ status: 500, ambiguous: true }), ["instagram"])).toContain(
      "couldn't tell whether it went through",
    );
  });

  it("409 and nothing left to retry", () => {
    expect(retryErrorMessage(err({ status: 409, ambiguous: false }), ["instagram"])).toContain(
      "posting right now",
    );
    expect(
      retryErrorMessage(err({ status: 400, code: "invalid_resource_state", ambiguous: false }), [
        "instagram",
      ]),
    ).toContain("nothing left to try again");
  });

  it("a refusal names the platforms", () => {
    expect(retryErrorMessage(err({ status: 422, ambiguous: false }), ["instagram", "tiktok"])).toBe(
      "Instagram or TikTok didn't accept this post. Check the text and the photo or video, then try again.",
    );
  });
});
