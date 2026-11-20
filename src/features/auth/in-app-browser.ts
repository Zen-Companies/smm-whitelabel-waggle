// In-app browsers (Jason, 20 Nov: ad clicks from TikTok and Instagram produced no signups).
// A tap on an ad or a link inside TikTok, Instagram, Facebook, Messenger, Snapchat or LinkedIn opens
// the page in that app's own embedded browser. Google refuses OAuth sign-in there
// ("Error 403: disallowed_useragent"), so "Sign up with Google" is a dead end for exactly the people
// the ads send. Pure; the browser part is in-app-google-gate.tsx.

const IN_APP_MARKERS: RegExp[] = [
  /BytedanceWebview/i, // TikTok (iOS and Android)
  /musical_ly/i, // TikTok (older builds)
  /\bTrill\b/i, // TikTok in some regions
  /\bInstagram\b/i,
  /FBAN|FBAV|FB_IAB|FBIOS/i, // Facebook and Messenger
  /\bSnapchat\b/i,
  /LinkedInApp/i,
  /\bLine\//i,
];

/** Android's WebView marks itself with "; wv)" in the platform part of the user agent. */
const ANDROID_WEBVIEW = /Android[^)]*;\s*wv\)/i;

/** Pure: whether a user agent is an app's embedded browser, where Google sign-in is blocked. */
export function isInAppBrowser(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  return IN_APP_MARKERS.some((re) => re.test(userAgent)) || ANDROID_WEBVIEW.test(userAgent);
}

/** Pure: which app, for the notice ("inside TikTok"). Falls back to a generic name. */
export function inAppName(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  if (/BytedanceWebview|musical_ly|\bTrill\b/i.test(ua)) return "TikTok";
  if (/\bInstagram\b/i.test(ua)) return "Instagram";
  if (/FBAN|FBAV|FB_IAB|FBIOS/i.test(ua)) return "Facebook";
  if (/\bSnapchat\b/i.test(ua)) return "Snapchat";
  if (/LinkedInApp/i.test(ua)) return "LinkedIn";
  return "this app";
}
