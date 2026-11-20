// Staff → Platforms (design "Every Zernio platform: honest connect note, usage at cost",
// approved 18 Nov): what owners see for each platform Zernio offers. Pure: no I/O.

export type PlatformStatus = "hidden" | "soon" | "available";
export const PLATFORM_STATUSES: readonly PlatformStatus[] = ["hidden", "soon", "available"];
export const isPlatformStatus = (v: unknown): v is PlatformStatus =>
  typeof v === "string" && (PLATFORM_STATUSES as readonly string[]).includes(v);

export const STATUS_LABELS: Record<PlatformStatus, string> = {
  hidden: "Hidden",
  soon: "Coming soon",
  available: "Available",
};

export interface SwitchablePlatform {
  /** The id used on Settings → Accounts (a social platform id or a More connections item id). */
  id: string;
  label: string;
  group:
    | "Social accounts"
    | "Messaging"
    | "Email and calendar"
    | "Website and shop"
    | "Ads"
    | "Business tools";
  /** Waggle can connect it today. When false, only Hidden or Coming soon. */
  built: boolean;
  /** What owners saw before this page existed (no stored row). */
  defaultStatus: PlatformStatus;
  /** Why it can't be Available, when it can't. */
  blocked?: string;
  /** Pay-per-use that goes on the owner's invoice at cost (X). */
  usageAtCost?: boolean;
}

const social = (
  id: string,
  label: string,
  opts: Partial<SwitchablePlatform> = {},
): SwitchablePlatform => ({
  id,
  label,
  group: "Social accounts",
  built: true,
  defaultStatus: "available",
  ...opts,
});
const item = (
  id: string,
  label: string,
  group: SwitchablePlatform["group"],
  opts: Partial<SwitchablePlatform> = {},
): SwitchablePlatform => ({ id, label, group, built: true, defaultStatus: "available", ...opts });
const later = { built: false, defaultStatus: "soon" as const };
// Their sign-in names Zernio: built, but they start as Coming soon until staff turn them on.
const namesZernio = { built: true, defaultStatus: "soon" as const };
// 18 Nov (later): connections added that day start Available; the note says Zernio is behind them.
const live = { built: true, defaultStatus: "available" as const };

export const SWITCHABLE: readonly SwitchablePlatform[] = [
  social("instagram", "Instagram"),
  social("facebook", "Facebook"),
  social("googlebusiness", "Google Business"),
  social("tiktok", "TikTok"),
  social("threads", "Threads"),
  social("youtube", "YouTube"),
  social("linkedin", "LinkedIn"),
  social("pinterest", "Pinterest"),
  social("bluesky", "Bluesky"),
  social("telegram", "Telegram"),
  social("whatsapp", "WhatsApp"),
  social("line", "LINE"),
  social("twitter", "X", { ...namesZernio, usageAtCost: true }),
  social("reddit", "Reddit", {
    ...later,
    blocked: "Reddit has blocked every app from its API since 19 Oct (our provider's Reddit docs).",
  }),
  social("discord", "Discord", {
    ...later,
    blocked: "Waiting on our provider: how Waggle learns the server after the bot is added.",
  }),
  social("snapchat", "Snapchat", {
    ...later,
    blocked: "Snap hasn't approved our provider's app; every connect is refused.",
  }),
  item("slack", "Slack", "Messaging", namesZernio),
  // The server address the owner pastes into WeChat is on zernio.com.
  item("wechat", "WeChat", "Messaging", live),
  item("gmail", "Gmail", "Email and calendar"),
  item("outlook", "Outlook", "Email and calendar"),
  item("email", "Email (IMAP)", "Email and calendar"),
  item("shopify", "Shopify", "Website and shop"),
  item("wordpress", "WordPress", "Website and shop"),
  item("webflow", "Webflow", "Website and shop"),
  item("wix", "Wix", "Website and shop", live),
  item("metaads", "Meta Ads", "Ads"),
  item("googleads", "Google Ads", "Ads", namesZernio),
  item("tiktokads", "TikTok Ads", "Ads", live),
  item("redditads", "Reddit Ads", "Ads", live),
  item("microsoftads", "Microsoft Ads", "Ads", live),
  item("xads", "X Ads", "Ads", live),
  item("googleanalytics", "Google Analytics", "Business tools", namesZernio),
  item("hubspot", "HubSpot", "Business tools", live),
  item("salesforce", "Salesforce", "Business tools", live),
  item("stripe", "Stripe", "Business tools", live),
];

export const switchableOf = (id: string): SwitchablePlatform | null =>
  SWITCHABLE.find((p) => p.id === id) ?? null;

/** The statuses staff may pick for a platform. */
export function allowedStatuses(p: SwitchablePlatform): PlatformStatus[] {
  return p.built && !p.blocked ? ["hidden", "soon", "available"] : ["hidden", "soon"];
}

/** What owners see: the stored choice when it's allowed, else the default. */
export function resolveStatus(
  p: SwitchablePlatform,
  stored: string | null | undefined,
): PlatformStatus {
  if (isPlatformStatus(stored) && allowedStatuses(p).includes(stored)) return stored;
  return allowedStatuses(p).includes(p.defaultStatus) ? p.defaultStatus : "soon";
}

export type PlatformStatuses = ReadonlyMap<string, PlatformStatus>;

/** Status for any id; ids not on the list keep working as before (available). */
export const statusOf = (statuses: PlatformStatuses, id: string): PlatformStatus =>
  statuses.get(id) ?? (switchableOf(id) ? resolveStatus(switchableOf(id)!, null) : "available");
