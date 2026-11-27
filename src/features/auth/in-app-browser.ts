// In-app browsers (Jason, 20 Nov: ad clicks from TikTok and Instagram produced no signups; hotfix
// "Any in-app browser", approved 27 Nov). A tap on an ad or a link inside TikTok, Instagram,
// Facebook, Messenger, Snapchat, LinkedIn… opens the page in that app's own embedded browser.
// Google refuses OAuth sign-in there ("Error 403: disallowed_useragent"), and TikTok's and Meta's
// sign-ins never come back. Pure; the browser parts are in-app-guard.tsx and in-app-card.tsx.

export type Device = "ios" | "android" | "other";

/** Pure: the phone's system, from the user agent (iPad counts as iOS). */
export function deviceOf(ua: string | null | undefined): Device {
  if (!ua) return "other";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

/**
 * The apps whose browser is known to break signing in to your accounts (TikTok's sign-in never
 * comes back; Meta's stops halfway). There, a full card replaces the form.
 */
export type BreakerApp = "Instagram" | "Facebook" | "Messenger" | "TikTok";
export type NamedApp =
  | BreakerApp
  | "Snapchat"
  | "LinkedIn"
  | "X"
  | "Pinterest"
  | "Reddit"
  | "LINE"
  | "Telegram"
  | "WeChat"
  | "Google app";

/** Each app's name tag in the user agent. Order matters: the first match names the app. */
const NAMED: readonly (readonly [NamedApp, RegExp])[] = [
  // TikTok: musical_ly_32.5.0 (iOS), trill_320304 / AppName/trill or musical_ly (Android),
  // musically_go (TikTok Lite), BytedanceWebview on both; some builds say TikTok.
  ["TikTok", /musical_?ly|BytedanceWebview|\btrill_\d|AppName\/trill|\bTikTok\b/i],
  ["Instagram", /\bInstagram\b/i],
  // WeChat before Messenger: "MicroMessenger" is not Facebook's Messenger.
  ["WeChat", /MicroMessenger/i],
  // Messenger: FBAN/MessengerForiOS, FBAN/MessengerLiteForiOS (iOS), FB_IAB/Orca-Android.
  ["Messenger", /FBAN\/Messenger|FB_IAB\/Orca|\bOrca-Android\b/i],
  ["Facebook", /FBAN|FBAV|FB_IAB|FBIOS|FB4A/i],
  ["Snapchat", /\bSnapchat\b/i],
  ["LinkedIn", /LinkedInApp/i],
  ["X", /\bTwitter/i],
  ["Pinterest", /\bPinterest\b/i],
  ["Reddit", /\bReddit\//i],
  ["LINE", /\bLine\/\d/i],
  ["Telegram", /\bTelegram/i],
  ["Google app", /\bGSA\/\d/],
];

const BREAKERS = new Set<string>(["Instagram", "Facebook", "Messenger", "TikTok"]);

/** Android's WebView marks itself with "; wv)"; real Chrome and Samsung Internet don't. */
const ANDROID_WEBVIEW = /Android[^)]*;\s*wv\)/i;

/** Real browsers on iPhone and Android, never flagged (they carry "Safari/" too, but be sure). */
const REAL_BROWSERS = /CriOS|FxiOS|EdgiOS|EdgA\/|OPiOS|OPT\/|OPR\/|DuckDuckGo|SamsungBrowser/i;

/** Pure: the app named in the user agent, or null. */
export function namedApp(ua: string | null | undefined): NamedApp | null {
  if (!ua) return null;
  return NAMED.find(([, re]) => re.test(ua))?.[0] ?? null;
}

export type InAppLevel = "card" | "note";

export interface InAppHit {
  /** The app's name, or null when Waggle can't tell which app ("another app's browser"). */
  app: NamedApp | null;
  /** "card": Instagram, Facebook, Messenger, TikTok. "note": any other in-app browser. */
  level: InAppLevel;
  device: Device;
}

/**
 * Pure: whether this page is open inside an app's embedded browser on a phone, which app, and how
 * firmly to send people out (approved 27 Nov):
 * - a named app (its name tag in the user agent);
 * - any other app on Android: the WebView's "; wv)" marker;
 * - any other app on iPhone/iPad: a mobile WebKit user agent without the "Safari/" token that
 *   Safari, Chrome, Firefox, Edge and DuckDuckGo all carry, unless Waggle runs from the home
 *   screen (`standalone`, known only in the browser).
 * Never on a computer.
 */
export function detectInApp(
  ua: string | null | undefined,
  opts: { standalone?: boolean } = {},
): InAppHit | null {
  if (!ua) return null;
  const device = deviceOf(ua);
  if (device === "other") return null;
  const app = namedApp(ua);
  if (app) return { app, level: BREAKERS.has(app) ? "card" : "note", device };
  if (REAL_BROWSERS.test(ua)) return null;
  if (device === "android") {
    return ANDROID_WEBVIEW.test(ua) ? { app: null, level: "note", device } : null;
  }
  if (opts.standalone) return null;
  const webkit = /AppleWebKit/i.test(ua) && /Mobile\//i.test(ua);
  return webkit && !/Safari\//i.test(ua) ? { app: null, level: "note", device } : null;
}

/**
 * Pure: the known breaker this page is open in (Instagram, Facebook, Messenger or TikTok), or
 * null. Readable on the server: it needs no home-screen check.
 */
export function breakerApp(ua: string | null | undefined): BreakerApp | null {
  const hit = detectInApp(ua);
  return hit?.level === "card" ? (hit.app as BreakerApp) : null;
}

/**
 * Pure: whether a user agent is an app's embedded browser, where Google sign-in is blocked. Server
 * safe: named apps and Android WebViews (the iPhone rule needs the home-screen check).
 */
export function isInAppBrowser(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return namedApp(userAgent) !== null || ANDROID_WEBVIEW.test(userAgent);
}

/** Pure: which app, for the notice ("inside TikTok"). Falls back to a generic name. */
export function inAppName(userAgent: string | null | undefined): string {
  return namedApp(userAgent) ?? "this app";
}
