import type { SiteKeys } from "@/lib/social/types";

// Settings → Accounts → More connections (T80, designs "Settings · Accounts" and "Connect with
// your own keys"). Sites connect with the owner's own keys typed into Waggle. Since 18 Nov
// (design "Every Zernio platform"), everything Zernio offers connects too: the partner's own
// sign-in opens after Waggle's "Before you connect" note, which says Zernio is behind it, and
// WeChat connects with its keys. Staff → Platforms decides what each owner sees.

export const OWN_KEY_PLATFORMS = ["shopify", "wordpress", "webflow"] as const;
export type OwnKeyPlatform = (typeof OWN_KEY_PLATFORMS)[number];
/** Every platform a More connections item can hold (read from the brand's Zernio profile). */
export const CONNECTED_PLATFORMS = [
  ...OWN_KEY_PLATFORMS,
  "imap",
  "wechat",
  "slack",
  "wix",
  "hubspot",
  "salesforce",
  "stripe",
  "googleanalytics",
  "googleads",
  "tiktokads",
  "redditads",
  "microsoftads",
  "xads",
] as const;

export const isOwnKeyPlatform = (p: string): p is OwnKeyPlatform =>
  (OWN_KEY_PLATFORMS as readonly string[]).includes(p);

export type ConnectionItem = {
  /** Logo slug (components/app/brand-logos). */
  id: string;
  label: string;
  line: string;
  how: "keys" | "email" | "mail" | "link" | "soon" | "integration" | "wechat";
  /** The Zernio platform its connections carry, when it differs from `id`. */
  platform?: string;
  href?: string;
};

export const MORE_CONNECTIONS: { title: string; items: ConnectionItem[] }[] = [
  {
    title: "Messaging",
    items: [
      { id: "sms", label: "SMS", line: "Texts on your Waggle number", how: "soon" },
      { id: "rcs", label: "RCS", line: "Branded texts with buttons", how: "soon" },
      { id: "imessage", label: "iMessage", line: "Blue-bubble texts (US, UK)", how: "soon" },
      { id: "wechat", label: "WeChat", line: "Verified Service Account", how: "wechat" },
      { id: "slack", label: "Slack", line: "Your team's Slack, in the inbox", how: "soon" },
    ],
  },
  {
    title: "Email and calendar",
    items: [
      { id: "gmail", label: "Gmail", line: "Email, calendar", how: "mail", platform: "google" },
      {
        id: "outlook",
        label: "Outlook",
        line: "Email, calendar, OneDrive",
        how: "mail",
        platform: "microsoft",
      },
      { id: "email", label: "Email", line: "Any email (IMAP)", how: "email", platform: "imap" },
    ],
  },
  {
    title: "Website and shop",
    items: [
      { id: "shopify", label: "Shopify", line: "Blog, products, orders", how: "keys" },
      { id: "wordpress", label: "WordPress", line: "Blog, and WooCommerce shops", how: "keys" },
      { id: "webflow", label: "Webflow", line: "Blog", how: "keys" },
      { id: "wix", label: "Wix", line: "Blog", how: "soon" },
    ],
  },
  {
    title: "Ads",
    items: [
      {
        id: "metaads",
        label: "Meta Ads",
        line: "Boost posts on Facebook and Instagram",
        how: "link",
        href: "/posts/ads",
      },
      { id: "googleads", label: "Google Ads", line: "Search and Maps ads", how: "soon" },
      { id: "tiktokads", label: "TikTok Ads", line: "TikTok ads", how: "soon" },
      { id: "redditads", label: "Reddit Ads", line: "Reddit ads", how: "soon" },
      { id: "microsoftads", label: "Microsoft Ads", line: "Bing search ads", how: "soon" },
      { id: "xads", label: "X Ads", line: "Ads on X (connect X first)", how: "soon" },
    ],
  },
  {
    title: "Business tools",
    items: [
      {
        id: "hubspot",
        label: "HubSpot",
        line: "CRM: your inbox contacts and messages",
        how: "soon",
      },
      {
        id: "salesforce",
        label: "Salesforce",
        line: "CRM: your inbox contacts and conversations",
        how: "soon",
      },
      { id: "googleanalytics", label: "Google Analytics", line: "Website visits", how: "soon" },
      { id: "stripe", label: "Stripe", line: "Payments count as sales from your ads", how: "soon" },
    ],
  },
];

/**
 * Paid channels set up in Settings (T82, T83) once staff switch them on for the brand: their
 * rows link there instead of saying Coming soon.
 */
export function withSettingsLinks(
  groups: typeof MORE_CONNECTIONS,
  on: { phone: boolean; messaging: boolean },
): typeof MORE_CONNECTIONS {
  const links: Record<string, string | null> = {
    sms: on.phone ? "/settings/phone" : null,
    rcs: on.messaging ? "/settings/messaging" : null,
    imessage: on.messaging ? "/settings/messaging" : null,
  };
  return groups.map((g) => ({
    ...g,
    items: g.items.map((item) => {
      const href = links[item.id];
      return href ? { ...item, how: "link" as const, href } : item;
    }),
  }));
}

type Bad = { ok: false; field: string; error: string };
const val = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

/** The keys for one site, checked before anything is sent (Zernio checks them again). */
export function parseSiteKeys(
  kind: OwnKeyPlatform,
  f: FormData,
): { ok: true; keys: SiteKeys } | Bad {
  if (kind === "shopify") {
    const raw = val(f, "shop")
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .split("/")[0];
    const handle = raw.replace(/\.myshopify\.com$/, "");
    if (!/^[a-z0-9][a-z0-9-]*$/.test(handle)) {
      return {
        ok: false,
        field: "shop",
        error: "Use your store's address, like harbour-bean.myshopify.com.",
      };
    }
    const accessToken = val(f, "accessToken");
    if (!/^shpat_\w{6,}$/.test(accessToken)) {
      return {
        ok: false,
        field: "accessToken",
        error: "Paste the Admin API key; it starts with shpat_.",
      };
    }
    return { ok: true, keys: { kind, shop: `${handle}.myshopify.com`, accessToken } };
  }
  if (kind === "wordpress") {
    let url: URL;
    try {
      url = new URL(val(f, "siteUrl"));
    } catch {
      return {
        ok: false,
        field: "siteUrl",
        error: "Use your site's address, like https://harbourbean.ph.",
      };
    }
    if (url.protocol !== "https:" || url.username || url.password) {
      return {
        ok: false,
        field: "siteUrl",
        error: "Use your site's https:// address, without a name or password in it.",
      };
    }
    const path = url.pathname.replace(/\/wp-json\/?$/, "").replace(/\/+$/, "");
    const siteUrl = `${url.origin}${path}`;
    const username = val(f, "username");
    if (!username) return { ok: false, field: "username", error: "Add the WordPress username." };
    const applicationPassword = val(f, "applicationPassword");
    if (applicationPassword.replace(/\s/g, "").length < 16) {
      return {
        ok: false,
        field: "applicationPassword",
        error: "Paste the application password from Users → Profile, not your login password.",
      };
    }
    return { ok: true, keys: { kind, siteUrl, username, applicationPassword } };
  }
  const siteToken = val(f, "siteToken");
  if (siteToken.length < 20)
    return { ok: false, field: "siteToken", error: "Paste the site's API key." };
  return { ok: true, keys: { kind, siteToken } };
}

/** LINE channel keys (LINE Official Account Manager → Settings → Messaging API). */
export function parseLineKeys(
  f: FormData,
): { ok: true; value: { channelId: string; channelSecret: string } } | Bad {
  const channelId = val(f, "channelId");
  if (!/^\d{6,20}$/.test(channelId))
    return { ok: false, field: "channelId", error: "The Channel ID is a number." };
  const channelSecret = val(f, "channelSecret");
  if (!/^[0-9a-f]{32}$/i.test(channelSecret)) {
    return {
      ok: false,
      field: "channelSecret",
      error: "The Channel secret is 32 letters and digits.",
    };
  }
  return { ok: true, value: { channelId, channelSecret } };
}

/** A WeChat Service Account's AppID (wx + 16) and AppSecret (32), per Zernio's WeChat connect docs. */
export function parseWechatKeys(
  f: FormData,
): { ok: true; value: { appId: string; appSecret: string } } | Bad {
  const appId = val(f, "appId");
  if (!/^wx[0-9a-z]{16}$/i.test(appId)) {
    return { ok: false, field: "appId", error: "The AppID starts with wx and has 18 characters." };
  }
  const appSecret = val(f, "appSecret");
  if (!/^[0-9a-z]{32}$/i.test(appSecret)) {
    return { ok: false, field: "appSecret", error: "The AppSecret is 32 letters and digits." };
  }
  return { ok: true, value: { appId, appSecret } };
}

/** An email address, checked before discovery. */
export function parseEmail(f: FormData): { ok: true; email: string } | Bad {
  const email = val(f, "email").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return { ok: false, field: "email", error: "Check the email address." };
  }
  return { ok: true, email };
}

export type WhatsAppKeys = {
  accessToken: string;
  wabaId: string;
  phoneNumberId: string;
  pin?: string;
};

export function parseWhatsAppKeys(f: FormData): { ok: true; value: WhatsAppKeys } | Bad {
  const accessToken = val(f, "accessToken");
  if (accessToken.length < 40) {
    return {
      ok: false,
      field: "accessToken",
      error: "Paste the permanent System User token from Meta.",
    };
  }
  const wabaId = val(f, "wabaId");
  if (!/^\d{5,30}$/.test(wabaId))
    return { ok: false, field: "wabaId", error: "The account ID is a number." };
  const phoneNumberId = val(f, "phoneNumberId");
  if (!/^\d{5,30}$/.test(phoneNumberId)) {
    return { ok: false, field: "phoneNumberId", error: "The phone number ID is a number." };
  }
  const pin = val(f, "pin");
  if (pin && !/^\d{6}$/.test(pin))
    return { ok: false, field: "pin", error: "The two-step PIN has 6 digits." };
  return { ok: true, value: { accessToken, wabaId, phoneNumberId, ...(pin ? { pin } : {}) } };
}
