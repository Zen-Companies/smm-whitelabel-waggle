// What to tell the owner when Zernio's connect flow sends them back to /settings. Zernio appends
// `error` (+ optional `error_message`) and `platform` on failure; on success only our own
// `connecting` param is there, and the account arrives a moment later via account.connected.

import { isPlatformId, platformLabel } from "@/lib/social/platforms";

export interface ConnectBanner {
  tone: "info" | "error";
  text: string;
}

const MAX_MESSAGE = 300;

type Params = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export function connectBanner(params: Params): ConnectBanner | null {
  const platformKey =
    first(params.platform) ?? first(params.connecting) ?? first(params.connected) ?? "";
  const platform = isPlatformId(platformKey) ? platformLabel(platformKey) : "the account";

  // Our Zernio plan has no room for another profile (402): ours to fix, not the owner's.
  if (first(params.connect_error) === "plan_limit") {
    return {
      tone: "error",
      text: `We can't add ${platform} for this brand right now: our connection limit is full. We've been alerted; please try again later.`,
    };
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
