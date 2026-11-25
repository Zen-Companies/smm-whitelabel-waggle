import { describe, expect, it } from "vitest";
import { failedAccounts, failureReason } from "./post-results";

// Partly posted (Posts round 1, 25 Nov): name each account that didn't get the post, and why.

const targets = [
  { id: "a1", platform: "instagram", username: "harbourbean", zernio_account_id: "z_ig1" },
  { id: "a2", platform: "instagram", username: "harbourbean.events", zernio_account_id: "z_ig2" },
  { id: "a3", platform: "facebook", username: "Harbour Bean", zernio_account_id: "z_fb" },
];

describe("failedAccounts", () => {
  it("names the failed account by its id, with a plain reason", () => {
    expect(
      failedAccounts(
        [
          { platform: "instagram", accountId: "z_ig1", status: "published", url: "u", error: null },
          {
            platform: "instagram",
            accountId: "z_ig2",
            status: "failed",
            url: null,
            error: "Token expired",
            errorCategory: "auth_expired",
          },
        ],
        targets,
      ),
    ).toEqual([
      {
        key: "z_ig2-0",
        name: "Instagram @harbourbean.events",
        reason: "The sign-in to Instagram expired. Reconnect it in Settings, then try again.",
      },
    ]);
  });

  it("older rows without an account id: by platform when only one account has it", () => {
    const out = failedAccounts(
      [
        {
          platform: "facebook",
          status: "failed",
          url: null,
          error: "Media could not be processed",
        },
        { platform: "instagram", status: "failed", url: null, error: null },
      ],
      targets,
    );
    expect(out.map((f) => f.name)).toEqual(["Facebook @Harbour Bean", "Instagram"]);
    expect(out[0].reason).toBe("Media could not be processed.");
    expect(out[1].reason).toBe("It didn't go out on Instagram.");
  });
});

describe("failureReason", () => {
  it("says what to do, with the platform's name", () => {
    expect(failureReason("tiktok", "platform_rate_limit", null)).toBe(
      "TikTok is taking too many posts right now. Try again later.",
    );
    expect(failureReason("instagram", "user_content", "Unrecognized file format")).toBe(
      "Instagram didn't accept the text, photo or video. Unrecognized file format.",
    );
  });
});
