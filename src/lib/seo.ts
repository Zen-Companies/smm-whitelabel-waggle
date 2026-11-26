// The app (app.gowaggle.ai, staging, previews) is never in search: gowaggle.ai is the public
// site (hotfix 26 Nov). Pure, no I/O: robots.txt, the root layout and the proxy use these.

/** The public marketing site. */
export const PUBLIC_SITE = "https://gowaggle.ai/";

/** The app's short description (no longer "AI that runs your socials"). */
export const APP_DESCRIPTION = "AI-assisted social media inbox for businesses.";

/** robots.txt and the X-Robots-Tag header: nothing in the app is indexed or followed. */
export const NO_INDEX_HEADER = "noindex, nofollow";

export function appRobots() {
  return { rules: { userAgent: "*", disallow: "/" } };
}

/**
 * Where a signed-out visitor to `/` goes: on production, the public site (permanent, so search
 * engines drop the app's home); elsewhere (staging, previews, local) the sign-in page.
 */
export function signedOutHome(vercelEnv: string | undefined): string {
  return vercelEnv === "production" ? PUBLIC_SITE : "/login";
}
