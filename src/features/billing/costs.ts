import * as Sentry from "@sentry/nextjs";
import type { ProviderUsage, SocialProvider } from "@/lib/social/types";
import type { ServiceClient } from "@/lib/supabase/service";

// T17 cost view (PRD F14): AI cost per tenant and per message from ai_usage, and Zernio's
// spend per tenant for the billing cycle (GET /v1/usage?range=cycle&groupBy=profile).

export interface TenantCost {
  tenantId: string;
  name: string;
  messages: number;
  repliesSent: number;
  aiCalls: number;
  aiCostUsd: number;
  /** null: Zernio usage not available (mock mode, error) or the tenant has no profile. */
  zernioCostUsd: number | null;
  /** AI cost per received message. */
  aiCostPerMessageUsd: number | null;
}

export interface ItemCost {
  itemId: string;
  tenantName: string;
  kind: string;
  status: string;
  category: string | null;
  receivedAt: string;
  aiCalls: number;
  aiCostUsd: number;
  purposes: string[];
}

export interface CostView {
  since: string;
  tenants: TenantCost[];
  items: ItemCost[];
  zernio: Pick<ProviderUsage, "periodStart" | "periodEnd" | "totalUsd" | "unattributedUsd"> | null;
  totals: { aiCostUsd: number; messages: number };
}

/** Pure: joins the AI rows with Zernio's per-profile usage. */
export function combineCosts(
  rows: {
    tenant_id: string;
    tenant_name: string;
    zernio_profile_id: string | null;
    messages: number;
    replies_sent: number;
    ai_calls: number;
    ai_cost_usd: number;
  }[],
  usage: ProviderUsage | null,
): TenantCost[] {
  const zernio = new Map(usage?.byProfile.map((g) => [g.profileId, g.totalUsd]) ?? []);
  return rows.map((r) => {
    const messages = Number(r.messages);
    const ai = Number(r.ai_cost_usd);
    return {
      tenantId: r.tenant_id,
      name: r.tenant_name,
      messages,
      repliesSent: Number(r.replies_sent),
      aiCalls: Number(r.ai_calls),
      aiCostUsd: ai,
      zernioCostUsd: usage && r.zernio_profile_id ? (zernio.get(r.zernio_profile_id) ?? 0) : null,
      aiCostPerMessageUsd: messages > 0 ? ai / messages : null,
    };
  });
}

export async function loadCostView(
  deps: { db: ServiceClient; social: () => SocialProvider },
  opts: { since?: Date } = {},
): Promise<CostView> {
  const since = opts.since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [tenants, items, usage] = await Promise.all([
    deps.db.rpc("cost_by_tenant", { p_since: since.toISOString() }),
    deps.db.rpc("cost_by_item", { p_since: since.toISOString(), p_limit: 50 }),
    deps
      .social()
      .getUsageByProfile({ signal: AbortSignal.timeout(10_000) })
      .catch((error: unknown) => {
        Sentry.captureException(error);
        return null;
      }),
  ]);
  if (tenants.error) throw new Error(`cost_by_tenant failed: ${tenants.error.message}`);
  if (items.error) throw new Error(`cost_by_item failed: ${items.error.message}`);
  const tenantCosts = combineCosts(tenants.data, usage);
  return {
    since: since.toISOString(),
    tenants: tenantCosts,
    items: items.data.map((i) => ({
      itemId: i.item_id,
      tenantName: i.tenant_name,
      kind: i.kind,
      status: i.status,
      category: i.category,
      receivedAt: i.received_at,
      aiCalls: Number(i.ai_calls),
      aiCostUsd: Number(i.ai_cost_usd),
      purposes: i.purposes,
    })),
    zernio: usage
      ? {
          periodStart: usage.periodStart,
          periodEnd: usage.periodEnd,
          totalUsd: usage.totalUsd,
          unattributedUsd: usage.unattributedUsd,
        }
      : null,
    totals: {
      aiCostUsd: tenantCosts.reduce((s, t) => s + t.aiCostUsd, 0),
      messages: tenantCosts.reduce((s, t) => s + t.messages, 0),
    },
  };
}
