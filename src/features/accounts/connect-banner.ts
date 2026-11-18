// What to tell the owner when Zernio's connect flow sends them back to /settings. Zernio appends
// `error` (+ optional `error_message`) and `platform` on failure; on success only our own
// `connecting` param is there, and the account arrives a moment later via account.connected.

import { isPlatformId, platformLabel } from "@/lib/social/platforms";

export interface ConnectBanner {
  tone: "info" | "error";
  text: string;
}

const MAX_MESSAGE = 300;

/** More connections that aren't social platforms (18 Nov). */
const CONNECTION_LABELS: Record<string, string> = {
  googleanalytics: "Google Analytics",
  slack: "Slack",
  wix: "Wix",
  hubspot: "HubSpot",
  salesforce: "Salesforce",
  stripe: "Stripe",
  wechat: "WeChat",
  googleads: "Google Ads",
  tiktokads: "TikTok Ads",
  redditads: "Reddit Ads",
  microsoftads: "Microsoft Ads",
  xads: "X Ads",
};

type Params = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** A connection's name: a social platform's label, or a More connections one (18 Nov). */
export function connectionLabel(id: string): string {
  return isPlatformId(id) ? platformLabel(id) : (CONNECTION_LABELS[id] ?? "Your account");
}

export function connectBanner(params: Params): ConnectBanner | null {
  const platformKey =
    first(params.platform) ?? first(params.connecting) ?? first(params.connected) ?? "";
  const platform = isPlatformId(platformKey)
    ? platformLabel(platformKey)
    : (CONNECTION_LABELS[platformKey] ?? "the account");

  // X Ads hangs off the brand's X account.
  if (first(params.connect_error) === "needs_x") {
    return { tone: "error", text: "Connect X first, then X Ads." };
  }

  // X needs pay-per-use set up on our side first (Zernio's 402): ours to fix, not the owner's.
  if (first(params.connect_error) === "plan_limit" && platformKey === "twitter") {
    return {
      tone: "error",
      text: "X can't be connected yet: we're finishing its pay-per-use setup on our side. We've been alerted; please try again later.",
    };
  }
  // Our Zernio plan has no room for another profile (402): ours to fix, not the owner's.
  if (first(params.connect_error) === "plan_limit") {
    return {
      tone: "error",
      text: `We can't add ${platform} for this brand right now: our connection limit is full. We've been alerted; please try again later.`,
    };
  }
  // The plan's connected accounts are all in use (Pricing Bible): an extra account or a bigger plan.
  if (first(params.connect_error) === "accounts_full") {
    return {
      tone: "error",
      text: `Your plan's connected accounts are all in use, so ${platform} can't be added yet. Add an extra account for $10 a month, or move to a bigger plan.`,
    };
  }
  // The "Before you connect" link is used once and lasts 10 minutes (18 Nov).
  if (first(params.connect_error) === "expired") {
    return { tone: "error", text: "That link expired. Click Connect again to start over." };
  }
  // T55: only Owners and Admins connect accounts.
  if (first(params.connect_error) === "not_allowed") {
    return { tone: "error", text: "Only Owners and Admins can connect accounts." };
  }
  if (first(params.connect_error)) {
    return { tone: "error", text: `Couldn't start connecting ${platform}. Please try again.` };
  }

  const error = first(params.error);
  if (error) {
    // Not a failure: an earlier request already finished the connection.
    if (error === "code_already_redeemed") {
      return { tone: "info", text: `${platform} is connecting. It will appear here shortly.` };
    }
    const message = first(params.error_message)?.slice(0, MAX_MESSAGE);
    return {
      tone: "error",
      text: message
        ? `Couldn't connect ${platform}: ${message}`
        : `Couldn't connect ${platform}. Please try again.`,
    };
  }

  // A setup step in Waggle (Bluesky) finished: the account is already listed.
  if (first(params.connected)) {
    return { tone: "info", text: `${platform} connected.` };
  }
  if (first(params.connecting)) {
    return { tone: "info", text: `${platform} connected. It will appear here shortly.` };
  }
  return null;
}
