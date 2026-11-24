// Decision 6 (Febron, 20 Nov): the business is named from the connected profile; when nothing
// gives a name, step 3's chat asks "What's your business called?" first (24 Nov: no name screen in
// step 2 any more). Never a made-up "Fresh's business". Pure, tested.

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
 * the account's @username or the platform's name, with the platform it came from. Null when none.
 */
export function profileBusinessNameFrom(
  profiles: readonly { name: string; platform: string }[],
  usernames: readonly (string | null)[],
): { name: string; platform: string } | null {
  const handles = new Set(usernames.filter((u): u is string => !!u).map(norm));
  for (const p of profiles) {
    const name = p.name.trim().replace(/\s+/g, " ");
    if (!name || name.length > 80) continue;
    if (isJustHandle(name, p.platform, handles) || norm(name) === norm(p.platform)) continue;
    return { name, platform: p.platform };
  }
  return null;
}

/** The display name alone (profileBusinessNameFrom's name). */
export function profileBusinessName(
  profiles: readonly { name: string; platform: string }[],
  usernames: readonly (string | null)[],
): string | null {
  return profileBusinessNameFrom(profiles, usernames)?.name ?? null;
}

// ---- the name, best source first (approved 24 Nov; confirmed in step 3 since 24 Nov) ----------
//
// Right after connect the brand is named at once, from the best source:
// 1. The platform's own page or location name (a Facebook Page's name, a Google Business location
//    title): exact, so the name is sure.
// 2. The setup AI profile's suggestion (read from the bio and page): a guess.
// 3. The profile's display name: a guess.
// A guess shows in step 3's facts card as unchecked ("from Instagram", dashed hexagon) until the
// owner taps "Looks good" or changes it. With no source at all, step 3 asks the name first.

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

export type NameSource = "page" | "ai" | "profile";

/**
 * The brand's name from the best source: the exact page name (sure), else the AI profile's
 * suggestion, else the display name (guesses). Null when none is usable.
 */
export function pickBrandName(input: {
  exact: string | null;
  ai: string | null;
  display: string | null;
}): { name: string; source: NameSource; sure: boolean } | null {
  const exact = cleanBusinessName(input.exact);
  if (exact) return { name: exact, source: "page", sure: true };
  const ai = cleanBusinessName(input.ai);
  if (ai) return { name: ai, source: "ai", sure: false };
  const display = cleanBusinessName(input.display);
  if (display) return { name: display, source: "profile", sure: false };
  return null;
}

/**
 * The AI profile's suggestion came in: the name it should take now, or null to leave it. Only a
 * name nobody has checked changes: still pending (none at all) or still a guess (the display
 * name, or an earlier suggestion), and only to a different usable name.
 */
export function nameFromLateAi(input: {
  pending: boolean;
  guessedFrom: string | null;
  current: string;
  ai: string | null;
}): string | null {
  const ai = cleanBusinessName(input.ai);
  if (!ai) return null;
  if (!input.pending && !input.guessedFrom) return null;
  return !input.pending && ai === input.current ? null : ai;
}

/** The facts card's tag for a guessed name: "from Instagram" (null when the name is sure). */
export function nameTag(guessedFrom: string | null, label: (p: string) => string): string | null {
  return guessedFrom ? `from ${label(guessedFrom)}` : null;
}
