import {
  ANALYTICS_PERIODS,
  periodWindow,
  type AnalyticsPeriod,
  type AnalyticsPlatform,
} from "./sync";

// The page's controls as searchParams (?section=overview&period=30&platform=all). Pure.

export const SECTIONS = [
  { key: "overview", label: "Overview" },
  { key: "posts", label: "Posts" },
  { key: "audience", label: "Audience" },
  { key: "work", label: "Waggle's work" },
] as const;
export type Section = (typeof SECTIONS)[number]["key"];

type Params = Record<string, string | string[] | undefined>;
export const param = (params: Params, key: string) =>
  typeof params[key] === "string" ? (params[key] as string) : undefined;

export function parseSection(value: string | undefined): Section {
  return SECTIONS.find((s) => s.key === value)?.key ?? "overview";
}

/** 7, 30 or 90 days (the periods the sync stores); anything else is 30. */
export function parsePeriod(value: string | undefined): AnalyticsPeriod {
  const n = Number(value);
  return (ANALYTICS_PERIODS as readonly number[]).includes(n) ? (n as AnalyticsPeriod) : 30;
}

/** A platform the brand has connected, else all. */
export function parsePlatform(value: string | undefined, connected: string[]): AnalyticsPlatform {
  return value && connected.includes(value) ? (value as AnalyticsPlatform) : "all";
}

const DAY_MS = 86_400_000;

export interface Window {
  /** Inclusive UTC days, as the dashboards count them. */
  fromDate: string;
  toDate: string;
  /** [from, to) as instants, and the same length just before. */
  from: Date;
  to: Date;
  prevFrom: Date;
  prevTo: Date;
  /** Every day in the window, oldest first. */
  days: string[];
}

/** The period ending today (UTC days), and the one before it. */
export function windowFor(period: number, now: Date): Window {
  const { fromDate, toDate } = periodWindow(period, now);
  const from = new Date(`${fromDate}T00:00:00Z`);
  const to = new Date(Date.parse(`${toDate}T00:00:00Z`) + DAY_MS);
  const prevFrom = new Date(from.getTime() - period * DAY_MS);
  return { fromDate, toDate, from, to, prevFrom, prevTo: from, days: daysBetween(from, period) };
}

/** `count` UTC days starting at `from`. */
export function daysBetween(from: Date, count: number): string[] {
  return Array.from({ length: count }, (_, i) =>
    new Date(from.getTime() + i * DAY_MS).toISOString().slice(0, 10),
  );
}

/** The link for a change of one control, keeping the others. */
export function analyticsHref(
  current: { section: Section; period: AnalyticsPeriod; platform: AnalyticsPlatform },
  change: Partial<{ section: Section; period: AnalyticsPeriod; platform: AnalyticsPlatform }> &
    Record<string, string | number | undefined> = {},
): string {
  const { section, period, platform, ...rest } = { ...current, ...change };
  const q = new URLSearchParams({
    section: String(section),
    period: String(period),
    platform: String(platform),
  });
  for (const [k, v] of Object.entries(rest)) {
    if (v !== undefined && v !== "") q.set(k, String(v));
  }
  return `/analytics?${q.toString()}`;
}
