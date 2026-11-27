// Leaving an in-app browser (Connect fix 2, 24 Nov; "Any in-app browser", approved 27 Nov): the
// address to hand over, the automatic switch tried once on load, the drawn steps by hand, and the
// card's and note's words. Pure, tested.

import type { BreakerApp, Device, InAppHit } from "./in-app-browser";

/** One drawn step: what the mini-phone shows and the line under it. */
export type DrawnStep =
  | { kind: "bar"; menu: string; label: string }
  | { kind: "sheet"; options: [string, string]; label: string }
  | { kind: "tabbar"; label: string }
  | { kind: "profile"; handle: string; menu: string; label: string }
  | {
      kind: "list";
      title: string;
      options: [string, string];
      chips?: [string, string];
      label: string;
    };

/** How to leave the in-app browser, drawn for that app on that phone. */
export interface LeaveSteps {
  /** "Safari" on iPhone, "Chrome" on Android, else "your browser". */
  browser: string;
  /** The ••• (iPhone) or ⋮ (Android) at the top right. */
  menu: string;
  /** What the menu calls it. */
  open: string;
  steps: DrawnStep[];
}

/** Pure: "Safari" on iPhone, "Chrome" on Android, else "your browser". */
export function browserFor(device: Device): string {
  return device === "ios" ? "Safari" : device === "android" ? "Chrome" : "your browser";
}

/**
 * Pure: the two taps out of an app's browser on this phone. Instagram on iPhone and Facebook on
 * Android are drawn on the board; the others follow the same menus (labels to check on real
 * phones).
 */
export function leaveSteps(device: Device): LeaveSteps {
  const android = device === "android";
  const menu = android ? "⋮" : "•••";
  // Both apps say "Open in browser" on iPhone; on Android their menus name Chrome.
  const open = android ? "Open in Chrome" : "Open in browser";
  return {
    browser: browserFor(device),
    menu,
    open,
    steps: [
      { kind: "bar", menu, label: `Tap ${menu} at the top right` },
      {
        kind: "sheet",
        options: [android ? "Refresh" : "Copy link", open],
        label: `Tap ${open}`,
      },
    ],
  };
}

/**
 * The address parameters that may travel to the other browser: the See all view, the plan picked
 * on the site, a friend's code and the campaign (first-touch UTM). Nothing else: no connect
 * errors, auth codes, checkout sessions, tokens or `next`.
 */
const SAFE_PARAMS = [
  "all",
  "plan",
  "ref",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_content",
  "utm_term",
] as const;
const SAFE_VALUE = /^[\w .~+-]{1,100}$/;

/**
 * Pure: the address to copy or hand to Safari or Chrome: this page's plain address, keeping only
 * the safe parameters above (`all` only as `all=1`). Over there the person signs in as usual and
 * lands back on this page.
 */
export function plainPageUrl(href: string): string | null {
  let u: URL;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const out = new URL(u.pathname, u.origin);
  for (const key of SAFE_PARAMS) {
    const v = u.searchParams.get(key);
    if (v === null) continue;
    if (key === "all" ? v === "1" : SAFE_VALUE.test(v)) out.searchParams.set(key, v);
  }
  return out.toString();
}

/**
 * Pure: an Android intent link that hands this page to Chrome; if Chrome isn't there, Android
 * opens `S.browser_fallback_url` (the same page) in the default browser. Only http(s) pages.
 */
export function chromeIntentUrl(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const scheme = u.protocol.slice(0, -1);
  const rest = `${u.host}${u.pathname}${u.search}`;
  return (
    `intent://${rest}#Intent;scheme=${scheme};package=com.android.chrome;` +
    `S.browser_fallback_url=${encodeURIComponent(u.toString())};end`
  );
}

/** Pure: the iOS major version (17 for "iPhone OS 17_1"), or null. */
export function iosMajor(ua: string): number | null {
  const m = /(?:iPhone|CPU) OS (\d+)_/i.exec(ua);
  return m ? Number(m[1]) : null;
}

/**
 * Pure: the address that asks iOS to open this page in Safari (`x-safari-https://`, iOS 17 and
 * later; only https pages). Apps may ignore it: nothing a website does can force Safari.
 */
export function safariSwitchUrl(url: string, ua: string): string | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  if ((iosMajor(ua) ?? 0) < 17) return null;
  return `x-safari-${u.toString()}`;
}

/**
 * Pure: what the page tries once on load to leave the in-app browser, or null for nothing:
 * Android, Chrome's intent link, only for a named app (an unknown WebView may show an error page
 * for it); iPhone, `x-safari-https://` from iOS 17. Always the plain page address.
 */
export function autoSwitchUrl(href: string, ua: string, hit: InAppHit): string | null {
  const plain = plainPageUrl(href);
  if (!plain) return null;
  if (hit.device === "android") return hit.app ? chromeIntentUrl(plain) : null;
  if (hit.device === "ios") return safariSwitchUrl(plain, ua);
  return null;
}

export type InAppWhere = "signup" | "signin" | "connect";

/**
 * Pure: the platforms whose connect fails inside this app's browser, so their tiles give way to
 * the card (setup's Connect and Settings → Accounts): Meta's inside Instagram, Facebook and
 * Messenger (24 Nov); TikTok's and Meta's inside TikTok (27 Nov).
 */
export function blockedPlatforms(app: BreakerApp): readonly string[] {
  return app === "TikTok" ? ["instagram", "facebook", "tiktok"] : ["instagram", "facebook"];
}

/** Pure: the full card's words (known breakers), on sign-up, sign-in or Connect. */
export function cardCopy(
  app: BreakerApp,
  device: Device,
  where: InAppWhere,
): { title: string; body: string; footer: string; copyLabel: string } {
  const android = device === "android";
  const browser = browserFor(device);
  const copyLabel = android ? "Copy link" : "Copy link instead";
  if (where === "connect") {
    const why =
      app === "TikTok"
        ? "TikTok’s browser breaks the sign-in to your accounts."
        : `Instagram and Facebook can’t sign in inside ${app}’s app.`;
    return {
      title: `Open Waggle in ${browser} to connect`,
      body: `${why} ${android ? "One tap and you’re back." : "Two taps and you’re back."}`,
      footer: "Your progress is saved. You’ll come right back to this step.",
      copyLabel,
    };
  }
  const then = where === "signup" ? "sign up" : "sign in";
  return {
    title: `Open Waggle in ${browser} first`,
    body: `${app}’s browser breaks the sign-in to your accounts. ${
      android ? "One tap and you’re there." : `Two taps and you’re there, then ${then} as usual.`
    }`,
    footer: `Nothing is lost: you start fresh in ${browser}.`,
    copyLabel,
  };
}

/** Pure: the gentle note's words (any other in-app browser). */
export function noteCopy(hit: Pick<InAppHit, "app" | "device">): {
  who: string;
  browser: string;
  menu: string;
} {
  return {
    who: hit.app ? `${hit.app}’s browser` : "another app’s browser",
    browser: browserFor(hit.device),
    menu: hit.device === "android" ? "⋮" : "•••",
  };
}

/**
 * Pure: the `inapp_switch_attempted` record (no user agent, no address, no customer text): which
 * app, which phone, where, and whether the page was still showing 1.5 s after the try.
 */
export function switchDetails(hit: InAppHit, where: InAppWhere, stayed: boolean) {
  return {
    app: hit.app ? hit.app.toLowerCase().replace(/\s+/g, "_") : "unknown",
    level: hit.level,
    device: hit.device,
    where,
    stayed,
  };
}
