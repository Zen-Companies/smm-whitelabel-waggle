import type { ServiceClient } from "@/lib/supabase/service";

// The monthly AI spend cap per business (T32, docs/tdd.md §19). Spend is live and practice calls
// in ai_usage this calendar month (UTC); lab calls are the operator's and never count. At the cap,
// messages are still sorted but no reply is drafted: they come to the owner instead.

/** Used when AI_MONTHLY_CAP_USD isn't set. */
export const DEFAULT_AI_MONTHLY_CAP_USD = 20;

/** From this share of the cap on, the owner sees a warning. */
export const AI_CAP_WARN_RATIO = 0.8;

export type AiSpendLevel = "ok" | "warn" | "reached";

export interface AiSpend {
  spentUsd: number;
  capUsd: number;
  level: AiSpendLevel;
  /** The business's own cap; null when it uses the default. */
  customCap: boolean;
  /** When the month's spend starts again from zero. */
  resetsAt: Date;
}

/** The first moment of `now`'s month, UTC. */
export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export function nextMonthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

/** AI_MONTHLY_CAP_USD when it's a number of 0 or more, else the default. */
export function defaultAiCap(env: Record<string, string | undefined> = process.env): number {
  const raw = env.AI_MONTHLY_CAP_USD;
  if (raw === undefined || raw.trim() === "") return DEFAULT_AI_MONTHLY_CAP_USD;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : DEFAULT_AI_MONTHLY_CAP_USD;
}

/** Pure. A cap of 0 means no drafting at all. */
export function aiSpendStatus(
  spentUsd: number,
  tenantCap: number | null,
  now: Date,
  env: Record<string, string | undefined> = process.env,
): AiSpend {
  const capUsd = tenantCap ?? defaultAiCap(env);
  const level: AiSpendLevel =
    spentUsd >= capUsd ? "reached" : spentUsd >= capUsd * AI_CAP_WARN_RATIO ? "warn" : "ok";
  return { spentUsd, capUsd, level, customCap: tenantCap !== null, resetsAt: nextMonthStart(now) };
}

/** This month's spend and cap for every business, or one (service role). */
export async function loadAiSpend(
  db: ServiceClient,
  now: Date,
  tenantId?: string,
): Promise<Map<string, AiSpend>> {
  const [spend, tenants] = await Promise.all([
    db.rpc("ai_spend_since", {
      p_since: monthStart(now).toISOString(),
      ...(tenantId ? { p_tenant_id: tenantId } : {}),
    }),
    tenantId
      ? db.from("tenants").select("id, ai_monthly_cap_usd").eq("id", tenantId)
      : db.from("tenants").select("id, ai_monthly_cap_usd"),
  ]);
  if (spend.error) throw new Error(`ai_spend_since failed: ${spend.error.message}`);
  if (tenants.error) throw new Error(`tenant cap lookup failed: ${tenants.error.message}`);
  const spent = new Map(spend.data.map((r) => [r.tenant_id, Number(r.spent_usd)]));
  return new Map(
    tenants.data.map((t) => [
      t.id,
      aiSpendStatus(
        spent.get(t.id) ?? 0,
        t.ai_monthly_cap_usd === null ? null : Number(t.ai_monthly_cap_usd),
        now,
      ),
    ]),
  );
}

/** One business's spend this month. */
export async function loadTenantAiSpend(
  db: ServiceClient,
  tenantId: string,
  now: Date,
): Promise<AiSpend> {
  const spend = (await loadAiSpend(db, now, tenantId)).get(tenantId);
  if (!spend) throw new Error("tenant cap lookup failed: no such tenant");
  return spend;
}
