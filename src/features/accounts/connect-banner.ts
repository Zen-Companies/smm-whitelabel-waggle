// What to tell the owner when Zernio's connect flow sends them back to /settings. Zernio appends
// `error` (+ optional `error_message`) and `platform` on failure; on success only our own
// `connecting` param is there, and the account arrives a moment later via account.connected.

export interface ConnectBanner {
  tone: "info" | "error";
  text: string;
}

const PLATFORM_NAMES: Record<string, string> = { instagram: "Instagram", facebook: "Facebook" };
const MAX_MESSAGE = 300;

type Params = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export function connectBanner(params: Params): ConnectBanner | null {
  const platformKey = first(params.platform) ?? first(params.connecting) ?? "";
  const platform = PLATFORM_NAMES[platformKey] ?? "the account";

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

  if (first(params.connecting)) {
    return { tone: "info", text: `${platform} connected. It will appear here shortly.` };
  }
  return null;
}
