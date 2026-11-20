// Decision 6 (Febron, 20 Nov): the business is named from the connected profile; when the
// profile has no name, setup asks "What's your business called?" at the start of step 2. Never a
// made-up "Fresh's business". Pure, tested.

/** The name a brand made by the first Connect carries until it is named (never shown). */
export const PENDING_BRAND_NAME = "My business";

const norm = (s: string) => s.trim().replace(/^@/, "").toLowerCase();

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
    if (handles.has(norm(name)) || norm(name) === norm(p.platform)) continue;
    return name;
  }
  return null;
}
