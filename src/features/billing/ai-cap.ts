// The operator's cap field on /admin/costs (T32): blank means the default (AI_MONTHLY_CAP_USD).

export const AI_CAP_MAX_USD = 10_000;

/** Pure. A blank field is null (the default); otherwise a dollar amount, rounded to cents. */
export function parseCapInput(raw: unknown): { cap: number | null } | { error: string } {
  const text = typeof raw === "string" ? raw.trim().replace(/^\$/, "") : "";
  if (text === "") return { cap: null };
  const value = Number(text);
  if (!Number.isFinite(value) || value < 0 || value > AI_CAP_MAX_USD) {
    return { error: `Enter an amount from 0 to ${AI_CAP_MAX_USD}, or leave it blank.` };
  }
  return { cap: Math.round(value * 100) / 100 };
}
