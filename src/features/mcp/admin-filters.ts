// Pure helpers for the staff MCP pages (docs/mcp/PLAN.md §7, Phase 4): the activity filters from
// the URL, the summary numbers, and the daily-limit field.

export const WINDOWS = {
  "24h": { label: "Last 24 hours", ms: 24 * 60 * 60_000 },
  "7d": { label: "Last 7 days", ms: 7 * 24 * 60 * 60_000 },
  "30d": { label: "Last 30 days", ms: 30 * 24 * 60 * 60_000 },
  "90d": { label: "Last 90 days", ms: 90 * 24 * 60 * 60_000 },
} as const;
export type WindowKey = keyof typeof WINDOWS;

/** The assistants the filter offers; "Playground" matches every staff Try it run. */
export const ASSISTANTS = ["Claude", "ChatGPT", "Grok", "Playground"] as const;

export interface ActivityFilters {
  tool: string | null;
  brand: string | null;
  assistant: (typeof ASSISTANTS)[number] | null;
  window: WindowKey;
  errorsOnly: boolean;
  /** Show calls before this time (older page). */
  before: string | null;
}

type Params = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Anything unknown in the URL falls back to "all". */
export function parseActivityFilters(sp: Params, toolNames: readonly string[]): ActivityFilters {
  const tool = one(sp.tool);
  const brand = one(sp.brand);
  const assistant = one(sp.assistant);
  const window = one(sp.when);
  const before = one(sp.before);
  return {
    tool: toolNames.includes(tool) ? tool : null,
    brand: UUID.test(brand) ? brand : null,
    assistant: (ASSISTANTS as readonly string[]).includes(assistant)
      ? (assistant as ActivityFilters["assistant"])
      : null,
    window: window in WINDOWS ? (window as WindowKey) : "24h",
    errorsOnly: one(sp.errors) === "1",
    before: before && !Number.isNaN(Date.parse(before)) ? new Date(before).toISOString() : null,
  };
}

/** The URL for these filters (empty ones left out). */
export function activityHref(f: Partial<ActivityFilters>): string {
  const q = new URLSearchParams();
  if (f.tool) q.set("tool", f.tool);
  if (f.brand) q.set("brand", f.brand);
  if (f.assistant) q.set("assistant", f.assistant);
  if (f.window && f.window !== "24h") q.set("when", f.window);
  if (f.errorsOnly) q.set("errors", "1");
  if (f.before) q.set("before", f.before);
  const s = q.toString();
  return `/admin/mcp-activity${s ? `?${s}` : ""}`;
}

/** Nearest-rank percentile of already-sorted numbers; null when empty. */
export function percentile(sorted: readonly number[], p: number): number | null {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[i];
}

/** "+12% vs the 24 hours before", or null when there's nothing to compare with. */
export function changeVsBefore(now: number, before: number): string | null {
  if (!before) return null;
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}%`;
}

/** The daily-limit field on Switches: blank = the default; else a whole number 1–10,000. */
export function parseDailyCap(
  raw: FormDataEntryValue | null,
): { cap: number | null } | { error: string } {
  const s = String(raw ?? "")
    .trim()
    .replace(/,/g, "");
  if (!s) return { cap: null };
  if (!/^\d+$/.test(s)) return { error: "A whole number, or blank for the default." };
  const n = Number(s);
  if (n < 1 || n > 10_000) return { error: "Between 1 and 10,000." };
  return { cap: n };
}
