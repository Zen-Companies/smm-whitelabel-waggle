// Decision 6 (Febron, 20 Nov): the business is named from the connected profile; when the
// profile has no name, setup asks "What's your business called?" at the start of step 2. Never a
// made-up "Fresh's business". Pure, tested.

/** The name a brand made by the first Connect carries until it is named (never shown). */
export const PENDING_BRAND_NAME = "My business";

const norm = (s: string) => s.trim().replace(/^@/, "").toLowerCase();

/**
 * Platforms whose "username" is a real @handle. Elsewhere (a Facebook Page, a LinkedIn page, a
 * Google Business location) Zernio's username is the page's own name, so it IS the business name
 * (hotfix 24 Nov: a Facebook connect was asked "What's your business called?").
 */
const HANDLE_PLATFORMS = new Set([
  "instagram",
  "tiktok",
  "twitter",
  "x",
  "threads",
  "youtube",
  "bluesky",
  "pinterest",
  "reddit",
]);

/** A display name that only repeats the account's handle: one word, no spaces, same as @username. */
const isJustHandle = (name: string, platform: string, handles: Set<string>): boolean =>
  HANDLE_PLATFORMS.has(platform.toLowerCase()) &&
  !/\s/.test(name.trim()) &&
  handles.has(norm(name));

/**
 * A business name from the connected accounts' profiles: the first display name that isn't just
 * the account's @username or the platform's name. Null when there's none.
 */
export function profileBusinessName(
  profiles: readonly { name: string; platform: string }[],
  usernames: readonly (string | null)[],
): string | null {
  const handles = new Set(usernames.filter((u): u is string => !!u).map(norm));
  for (const p of profiles) {
    const name = p.name.trim().replace(/\s+/g, " ");
    if (!name || name.length > 80) continue;
    if (isJustHandle(name, p.platform, handles) || norm(name) === norm(p.platform)) continue;
    return name;
  }
  return null;
}
