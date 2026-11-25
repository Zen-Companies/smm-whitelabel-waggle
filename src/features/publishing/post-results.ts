import { platformLabel } from "@/lib/social/platforms";
import type { PostPlatformResult } from "@/lib/social/types";

// A post that went out to some accounts only (Posts round 1, 25 Nov): which account didn't get
// it, and why, in plain words. Pure.

export interface TargetAccount {
  id: string;
  platform: string;
  username: string | null;
  zernio_account_id?: string | null;
}

/** Why one platform refused, from Zernio's failure category; the platform's own words after. */
export function failureReason(
  platform: string,
  category: string | null | undefined,
  error: string | null | undefined,
): string {
  const name = platformLabel(platform);
  const detail = error?.trim() ? error.trim().replace(/\.?$/, ".") : "";
  switch (category) {
    case "auth_expired":
      return `The sign-in to ${name} expired. Reconnect it in Settings, then try again.`;
    case "account_issue":
      return `${name} has a problem with this account. Check it in the ${name} app, then try again.`;
    case "user_abuse":
      return `${name} limited this account for now. Wait a while, then try again.`;
    case "platform_rate_limit":
    case "quota_exhausted":
      return `${name} is taking too many posts right now. Try again later.`;
    case "platform_error":
    case "system_error":
      return `${name} had a problem on its side. Try again.`;
    case "user_content":
    case "platform_rejected":
      return `${name} didn't accept the text, photo or video.${detail ? ` ${detail}` : ""}`;
    default:
      return detail || `It didn't go out on ${name}.`;
  }
}

/**
 * Each account the post failed on, named ("Instagram @harbourbean"), with its reason. A result
 * without an account id (older rows) is matched by platform when that's unambiguous.
 */
export function failedAccounts(
  results: PostPlatformResult[],
  targets: TargetAccount[],
): { key: string; name: string; reason: string }[] {
  return results
    .filter((r) => r.status === "failed")
    .map((r, i) => {
      const byId = r.accountId
        ? targets.find((t) => t.zernio_account_id && t.zernio_account_id === r.accountId)
        : undefined;
      const samePlatform = targets.filter((t) => t.platform === r.platform);
      const account = byId ?? (samePlatform.length === 1 ? samePlatform[0] : undefined);
      const name = account
        ? `${platformLabel(account.platform)} @${account.username ?? "account"}`
        : platformLabel(r.platform);
      return {
        key: `${r.accountId ?? r.platform}-${i}`,
        name,
        reason: failureReason(r.platform, r.errorCategory, r.error),
      };
    });
}
