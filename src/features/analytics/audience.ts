import type { Demographics } from "@/lib/social/analytics-types";

// Audience breakdowns (T51) as shares. Pure.

export interface Share {
  key: string;
  label: string;
  /** Percent of followers, 0-100. */
  share: number;
}

const total = (rows: { value: number }[]) => rows.reduce((a, r) => a + Math.max(0, r.value), 0);

/**
 * Meta sends counts (or shares) per value. Countries cover every follower, so they make the
 * denominator for cities too (whose list is only the top ones); otherwise the dimension's own sum.
 */
export function shares(demo: Demographics, dimension: string): Share[] {
  const rows = demo[dimension] ?? [];
  const base = total(demo.country ?? []) || total(rows);
  if (!base) return [];
  return rows
    .filter((r) => r.value > 0)
    .map((r) => ({ key: r.key, label: r.key, share: (r.value / base) * 100 }))
    .sort((a, b) => b.share - a.share);
}

const AGE_ORDER = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"];

/** Age groups young to old, with an en dash: "25–34". */
export function ageShares(demo: Demographics): Share[] {
  const rows = demo.age ?? [];
  const base = total(rows);
  if (!base) return [];
  return [...rows]
    .sort((a, b) => {
      const ia = AGE_ORDER.indexOf(a.key);
      const ib = AGE_ORDER.indexOf(b.key);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    })
    .map((r) => ({ key: r.key, label: r.key.replace("-", "–"), share: (r.value / base) * 100 }));
}

const GENDER: Record<string, string> = { F: "women", M: "men", U: "not given" };

/** "Women 64%, men 34%, not given 2%." or null. */
export function genderLine(demo: Demographics): string | null {
  const rows = demo.gender ?? [];
  const base = total(rows);
  if (!base) return null;
  const parts = [...rows]
    .sort((a, b) => b.value - a.value)
    .map(
      (r) =>
        `${GENDER[r.key.toUpperCase()] ?? r.key.toLowerCase()} ${Math.round((r.value / base) * 100)}%`,
    );
  const line = parts.join(", ");
  return `${line.charAt(0).toUpperCase()}${line.slice(1)}.`;
}

/** "Quezon City, Metro Manila" → "Quezon City". */
export const cityName = (key: string) => key.split(",")[0].trim();

const REGIONS = new Intl.DisplayNames(["en"], { type: "region" });

/** "PH" → "Philippines"; unknown codes stay as they are. */
export function countryName(code: string): string {
  try {
    return REGIONS.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

/** "1%" or "<1%" or "38%". */
export function shareText(share: number): string {
  if (share > 0 && share < 1) return "<1%";
  return `${Math.round(share)}%`;
}

/** The followers series for the period: the last `days` points, oldest first. */
export function lastDays<T extends { date: string }>(points: T[], days: number): T[] {
  return [...points].sort((a, b) => a.date.localeCompare(b.date)).slice(-days);
}
