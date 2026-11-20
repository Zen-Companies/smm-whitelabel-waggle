// Prompt and question-set versions ("2026-11-20.1") shown by date in the Lab: "20 Nov".
// The value sent with the form stays the version; only the label changes.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Each version's label; a second version on the same date gets " (2)", a third " (3)". */
export function versionLabels(versions: readonly string[]): Record<string, string> {
  const seen = new Map<string, number>();
  const out: Record<string, string> = {};
  for (const v of versions) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:\.\d+)?$/.exec(v);
    const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
    if (!m || !month) {
      out[v] = v;
      continue;
    }
    const base = `${Number(m[3])} ${month}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    out[v] = n === 1 ? base : `${base} (${n})`;
  }
  return out;
}
