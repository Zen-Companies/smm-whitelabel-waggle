import type { ServiceClient } from "@/lib/supabase/service";
import type { McpPrincipal } from "./context";
import { BURST_WINDOW_MS, redactArgs, type CallCounts, type CallKind } from "./limits";

// The MCP activity log (mcp_calls, docs/mcp/PLAN.md §7). Each call is logged before it runs, so
// the rate limits count it, then finished with its outcome. Arguments are redacted (rule 10).

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export async function startCall(
  db: ServiceClient,
  input: {
    principal: McpPrincipal;
    tool: string;
    kind: CallKind;
    tenantId: string | null;
    args: unknown;
    playground?: boolean;
    now: Date;
  },
): Promise<string> {
  const { data, error } = await db
    .from("mcp_calls")
    .insert({
      at: input.now.toISOString(),
      user_id: input.principal.userId,
      client_id: input.principal.clientId,
      client_name: input.principal.clientName,
      tenant_id: input.tenantId,
      tool: input.tool,
      kind: input.kind,
      args: redactArgs(input.args),
      playground: input.playground ?? false,
    })
    .select("id")
    .single();
  if (error) throw new Error(`mcp: logging the call failed: ${error.message}`);
  return data.id;
}

export async function finishCall(
  db: ServiceClient,
  id: string,
  outcome: { status: "ok" | "error" | "rejected"; errorCode?: string | null; latencyMs: number },
): Promise<void> {
  await db
    .from("mcp_calls")
    .update({
      status: outcome.status,
      error_code: outcome.errorCode ?? null,
      latency_ms: Math.round(outcome.latencyMs),
    })
    .eq("id", id);
}

/** Counts per window, this call included. Refused calls don't count; failed sends don't either. */
export async function countCalls(
  db: ServiceClient,
  input: { principal: McpPrincipal; tenantId: string | null; kind: CallKind; now: Date },
): Promise<CallCounts> {
  const since = (ms: number) => new Date(input.now.getTime() - ms).toISOString();
  const count = async (build: () => PromiseLike<{ count: number | null }>) =>
    (await build()).count ?? 0;
  const base = () =>
    db.from("mcp_calls").select("id", { count: "exact", head: true }).neq("status", "rejected");
  const { userId, clientId } = input.principal;
  const brand = input.tenantId;

  const [userClientMinute, userDay, brandActsHour, brandSendsBurst, brandSendsDay] =
    await Promise.all([
      count(() => base().eq("user_id", userId).eq("client_id", clientId).gte("at", since(MINUTE))),
      count(() => base().eq("user_id", userId).gte("at", since(DAY))),
      brand && input.kind !== "read"
        ? count(() =>
            base().eq("tenant_id", brand).in("kind", ["act", "send"]).gte("at", since(HOUR)),
          )
        : Promise.resolve(null),
      brand && input.kind === "send"
        ? count(() =>
            base()
              .eq("tenant_id", brand)
              .eq("kind", "send")
              .neq("status", "error")
              .gte("at", since(BURST_WINDOW_MS)),
          )
        : Promise.resolve(null),
      brand && input.kind === "send"
        ? count(() =>
            base()
              .eq("tenant_id", brand)
              .eq("kind", "send")
              .neq("status", "error")
              .gte("at", since(DAY)),
          )
        : Promise.resolve(null),
    ]);
  return { userClientMinute, userDay, brandActsHour, brandSendsBurst, brandSendsDay };
}

/** The activity log keeps 90 days (design v3 "MCP activity"). */
export const MCP_CALLS_KEEP_MS = 90 * DAY;

/** Deletes log rows older than 90 days, a batch per run; returns how many went. */
export async function pruneCalls(db: ServiceClient, now: Date, batch = 5000): Promise<number> {
  const { data: old } = await db
    .from("mcp_calls")
    .select("id")
    .lt("at", new Date(now.getTime() - MCP_CALLS_KEEP_MS).toISOString())
    .limit(batch);
  if (!old?.length) return 0;
  const { error } = await db
    .from("mcp_calls")
    .delete()
    .in(
      "id",
      old.map((r) => r.id),
    );
  if (error) throw new Error(`mcp: pruning the activity log failed: ${error.message}`);
  return old.length;
}
