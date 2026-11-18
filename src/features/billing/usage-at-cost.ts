// Usage at cost (design "Every Zernio platform", approved 18 Nov): pay-per-use that Zernio bills
// us for a business goes on the owner's invoice in the same billing cycle, at cost, no markup and
// no limit. Pure: no I/O.

/** Zernio's product families, in owners' words. Connected accounts are priced by the plan. */
const FAMILY_LABELS: Record<string, string> = {
  xApi: "X",
  sms: "Texts",
  calls: "Calls",
  numbers: "Phone numbers",
  imessage: "iMessage",
  messages: "Messages",
  verify: "ID checks",
  dlc: "Text registration",
  ads: "Managed ads",
  other: "Other",
};
/** Never passed through: the plan prices accounts, credits are Zernio's free tier, total is a sum. */
const NOT_PASSED = new Set(["accounts", "credits", "total"]);

export interface UsagePart {
  label: string;
  cents: number;
}

/** One business's pay-per-use for the window, rounded to cents; parts under a cent are left out. */
export function usageParts(totals: Record<string, number>): { cents: number; parts: UsagePart[] } {
  const parts: UsagePart[] = [];
  for (const [family, usd] of Object.entries(totals)) {
    if (NOT_PASSED.has(family) || !Number.isFinite(usd) || usd <= 0) continue;
    const cents = Math.round(usd * 100);
    if (cents < 1) continue;
    parts.push({ label: FAMILY_LABELS[family] ?? "Other", cents });
  }
  // Same label twice (two unknown families): one line.
  const merged = new Map<string, number>();
  for (const p of parts) merged.set(p.label, (merged.get(p.label) ?? 0) + p.cents);
  const list = [...merged].map(([label, cents]) => ({ label, cents }));
  list.sort((a, b) => b.cents - a.cents);
  return { cents: list.reduce((n, p) => n + p.cents, 0), parts: list };
}

export const usd = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const day = (d: Date) =>
  d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** The invoice line: "Usage at cost, Harbour Bean Café, Nov 12 – Dec 11: X $3.40, texts $1.10". */
export function usageLineText(
  business: string,
  start: Date,
  end: Date,
  parts: UsagePart[],
): string {
  const what = parts
    .map((p, i) => `${i ? p.label.toLowerCase() : p.label} ${usd(p.cents)}`)
    .join(", ");
  return `Usage at cost, ${business}, ${day(start)} – ${day(end)}: ${what}`.slice(0, 500);
}

/** Zernio's window: inclusive UTC dates from the period start to the day before its end. */
export function usageWindow(start: Date, end: Date): { from: string; to: string } {
  const last = new Date(Math.max(start.getTime(), end.getTime() - 1));
  return { from: start.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}
