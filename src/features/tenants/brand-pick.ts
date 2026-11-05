// Brands (T47): which of the user's tenants is open. Pure, so it is unit tested.

/** The cookie holding the open brand's tenant id. Checked against the user's tenants on read. */
export const BRAND_COOKIE = "waggle_brand";
export const BRAND_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const BRAND_NAME_MAX = 80;

/**
 * The open brand: the one in the cookie if it is still one of the user's tenants, else the first
 * (oldest). `brands` must be sorted oldest first. A tampered or stale cookie never opens a brand
 * the user doesn't belong to, because `brands` comes from RLS.
 */
export function pickBrand<T extends { id: string }>(
  brands: readonly T[],
  cookieValue: string | undefined,
): T | null {
  return brands.find((b) => b.id === cookieValue) ?? brands[0] ?? null;
}

/**
 * Where to land after switching brand: the same section of the app ("/posts/abc" → "/posts"),
 * because a page for one brand's item, post or entry doesn't exist in the other. Anything that
 * isn't a plain in-app path goes to the inbox.
 */
export function sectionPath(path: string | null | undefined): string {
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return "/inbox";
  }
  const section = path.split(/[?#]/)[0].split("/")[1];
  if (!section || !/^[a-z0-9-]+$/.test(section) || section === "brands") return "/inbox";
  return `/${section}`;
}

/** Up to two initials for a brand's avatar: "Bloom & Stem Florist" → "BS". */
export function brandInitials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0];
  return letters.toUpperCase();
}

/** A steady color for a brand's avatar, from its id (design: initials on a tinted square). */
export const BRAND_TINTS = ["honey", "leaf", "stone"] as const;
export function brandTint(id: string): (typeof BRAND_TINTS)[number] {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return BRAND_TINTS[h % BRAND_TINTS.length];
}
