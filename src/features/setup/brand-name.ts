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

// ---- the name, best source first (approved 24 Nov) -----------------------------------------------
//
// 1. The platform's own page or location name (a Facebook Page's name, a Google Business location
//    title): exact, so the brand is named with no question.
// 2. Otherwise setup asks "Is this your business name?", never with an empty box when there is a
//    guess: the AI profile's suggestion (read from the bio and page), else the profile's display
//    name, else empty.

/** Where an exact name can come from: platforms whose page has its own business name. */
export const EXACT_NAME_PLATFORMS: ReadonlySet<string> = new Set(["facebook", "googlebusiness"]);

/** A usable business name: a string, spaces tidied, 1 to 80 characters, not a platform's name. */
export function cleanBusinessName(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const name = raw.trim().replace(/\s+/g, " ");
  if (!name || name.length > 80) return null;
  if (/^(facebook|instagram|google|google business|tiktok|linkedin)$/i.test(name)) return null;
  return name;
}

/** The first exact page name the connected accounts gave, in their order. Null when none. */
export function exactPageName(
  pages: readonly { platform: string; name: string | null }[],
): string | null {
  for (const p of pages) {
    if (!EXACT_NAME_PLATFORMS.has(p.platform)) continue;
    const name = cleanBusinessName(p.name);
    if (name) return name;
  }
  return null;
}

/** The name screen's best guess: the AI suggestion, else the display name, else empty. */
export function nameGuess(input: { ai: string | null; display: string | null }): string {
  return cleanBusinessName(input.ai) ?? cleanBusinessName(input.display) ?? "";
}

/**
 * What the field shows when a newer guess arrives (the AI profile came in while the screen was
 * open): the guess, unless the owner already typed.
 */
export function prefillValue(input: { typed: boolean; current: string; guess: string }): string {
  return input.typed || !input.guess ? input.current : input.guess;
}

/** The button: "Yes, that's it" while the field still shows the guess, else "Save name". */
export function nameButtonLabel(input: { value: string; guess: string }): string {
  return input.guess && input.value.trim() === input.guess ? "Yes, that’s it" : "Save name";
}
