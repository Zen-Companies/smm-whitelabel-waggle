// Connect fix 2 (board "Connect fix 2", approved 24 Nov): warn before the Meta buttons, show how to
// switch, and block Instagram and Facebook inside their own in-app browsers. Pure, tested.

import { blockedPlatforms, type BreakerApp, type Device, type DrawnStep } from "@/features/auth";

// Moved to the auth feature with the in-app hotfix (27 Nov): sign-up and sign-in use them too.
export {
  chromeIntentUrl,
  deviceOf,
  leaveSteps,
  plainPageUrl,
  type Device,
  type DrawnStep,
  type LeaveSteps,
} from "@/features/auth";

/** The in-app browsers that block a connect: Instagram, Facebook, Messenger, TikTok. */
export type InApp = BreakerApp;
export type SwitchPlatform = "instagram" | "facebook";

/** Pure: the platforms whose tiles give way to the block card inside this app's browser. */
export function blockedIn(app: InApp): ReadonlySet<string> {
  return new Set(blockedPlatforms(app));
}

/**
 * Pure: the tiles that stay usable on this page. Inside Instagram's or Facebook's browser,
 * Instagram and Facebook give way to the block card; TikTok, LinkedIn and the rest stay (board
 * "Choice: only Instagram and Facebook are blocked").
 */
export function usableHere<T extends string>(ids: readonly T[], inApp: InApp | null): T[] {
  return inApp ? ids.filter((id) => !blockedIn(inApp).has(id)) : [...ids];
}

/**
 * Pure: inside Instagram's or Facebook's browser, a problem with an Instagram or Facebook connect
 * (personal Instagram, cancelled sign-in) shows the block card, never a Meta button that would
 * fail here again.
 */
export function metaBlockedHere(
  problem: { kind: string; platform?: string } | null,
  inApp: InApp | null,
): boolean {
  if (!inApp || !problem) return false;
  if (problem.kind === "instagram-personal") return true;
  return problem.kind === "cancelled" && blockedIn(inApp).has(problem.platform ?? "");
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

/** Pure: the `connect_blocked_in_app` audit details (no user agent, no ids beyond these). */
export function blockedDetails(app: InApp, device: Device) {
  return {
    platform: app.toLowerCase(),
    browser_class:
      app === "Instagram"
        ? "in_app_instagram"
        : app === "TikTok"
          ? "in_app_tiktok"
          : "in_app_facebook",
    device,
  };
}
