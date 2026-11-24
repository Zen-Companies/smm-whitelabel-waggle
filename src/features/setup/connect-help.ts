// Connect fix 2 (board "Connect fix 2", approved 24 Nov): warn before the Meta buttons, show how to
// switch, and block Instagram and Facebook inside their own in-app browsers. Pure, tested.

export type Device = "ios" | "android" | "other";
export type InApp = "Instagram" | "Facebook";
export type SwitchPlatform = "instagram" | "facebook";

/** Pure: the phone's system, from the user agent (iPad counts as iOS). */
export function deviceOf(ua: string | null | undefined): Device {
  if (!ua) return "other";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

/** Pure: a desktop browser (where "Scan to finish on your phone" shows). */
export function isDesktop(ua: string | null | undefined): boolean {
  if (!ua || /Mobi|Android|iPhone|iPad|iPod/i.test(ua)) return false;
  return /Windows NT|Macintosh|X11|CrOS|Linux x86_64/i.test(ua);
}

/** The platforms that can't sign in inside Instagram's or Facebook's own browser. */
export const BLOCKED_IN_APP = new Set<string>(["instagram", "facebook"]);

/**
 * Pure: the tiles that stay usable on this page. Inside Instagram's or Facebook's browser,
 * Instagram and Facebook give way to the block card; TikTok, LinkedIn and the rest stay (board
 * "Choice: only Instagram and Facebook are blocked").
 */
export function usableHere<T extends string>(ids: readonly T[], inApp: InApp | null): T[] {
  return inApp ? ids.filter((id) => !BLOCKED_IN_APP.has(id)) : [...ids];
}

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

/**
 * Pure: the two taps out of Instagram's or Facebook's browser on this phone. Instagram on iPhone
 * and Facebook on Android are drawn on the board; the others follow the same menus (labels to
 * check on real phones).
 */
export function leaveSteps(device: Device): LeaveSteps {
  const android = device === "android";
  const menu = android ? "⋮" : "•••";
  // Both apps say "Open in browser" on iPhone; on Android their menus name Chrome.
  const open = android ? "Open in Chrome" : "Open in browser";
  const browser = device === "ios" ? "Safari" : android ? "Chrome" : "your browser";
  return {
    browser,
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

/** Pure: Instagram's and Facebook's switch steps (board "How to switch (30 sec)"). */
export function switchSteps(platform: SwitchPlatform): DrawnStep[] {
  if (platform === "facebook") {
    return [
      { kind: "profile", handle: "Menu", menu: "☰", label: "Tap ☰ Menu" },
      {
        kind: "list",
        title: "Menu",
        options: ["Groups", "Pages"],
        label: "Tap Pages",
      },
      {
        kind: "list",
        title: "Pages",
        options: ["Your Pages", "+ Create"],
        label: "Tap + Create, then follow the steps",
      },
    ];
  }
  return [
    { kind: "tabbar", label: "Open your profile" },
    { kind: "profile", handle: "your_cafe", menu: "☰", label: "Tap ☰ at the top" },
    {
      kind: "list",
      title: "Account type",
      options: ["Personal", "Switch to professional"],
      chips: ["Business", "Creator"],
      label: "Account type → Switch to professional",
    },
  ];
}

/** Pure: the reassurance under the switch steps. */
export function switchNote(platform: SwitchPlatform): string {
  return platform === "facebook"
    ? "Free. Your own profile stays the same."
    : "Free. Your posts and followers stay the same.";
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

/** Pure: the `connect_blocked_in_app` audit details (no user agent, no ids beyond these). */
export function blockedDetails(app: InApp, device: Device) {
  return {
    platform: app.toLowerCase(),
    browser_class: app === "Instagram" ? "in_app_instagram" : "in_app_facebook",
    device,
  };
}
