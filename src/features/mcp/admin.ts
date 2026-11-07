import { writeAudit } from "@/lib/audit";
import type { ServiceClient } from "@/lib/supabase/service";
import { emailsOf } from "@/lib/supabase/users";
import type { Json } from "@/lib/supabase/database.types";
import { WINDOWS, percentile, type ActivityFilters } from "./admin-filters";
import type { McpDeps, McpPrincipal } from "./context";
import { MCP_FLAG } from "./flags";
import { callTool } from "./server";
import { toolByName } from "./tools/registry";

// Data and changes behind the staff MCP pages (docs/mcp/PLAN.md §7, Phase 4). Each function takes
// the service client; the Server Actions check the staff permission before calling them.

const DAY = 24 * 60 * 60_000;
const since = (now: Date, ms: number) => new Date(now.getTime() - ms).toISOString();

// ---------------- Activity ----------------

export interface ActivityRow {
  id: string;
  at: string;
  tool: string;
  brand: string | null;
  user: string;
  assistant: string;
  playground: boolean;
  status: string;
  errorCode: string | null;
  latencyMs: number | null;
  args: Json;
}

export interface ActivitySummary {
  calls: number;
  callsBefore: number;
  errors: number;
  limited: number;
  medianMs: number | null;
  p95Ms: number | null;
  sends: number;
}

export const ACTIVITY_PAGE = 100;

export async function loadActivity(db: ServiceClient, f: ActivityFilters, now: Date) {
  const windowMs = WINDOWS[f.window].ms;
  const from = since(now, windowMs);

  let q = db
    .from("mcp_calls")
    .select(
      "id, at, tool, tenant_id, user_id, client_name, status, error_code, latency_ms, args, playground",
    )
    .gte("at", from)
    .order("at", { ascending: false })
    .limit(ACTIVITY_PAGE + 1);
  if (f.tool) q = q.eq("tool", f.tool);
  if (f.brand) q = q.eq("tenant_id", f.brand);
  if (f.assistant === "Playground") q = q.eq("playground", true);
  else if (f.assistant) q = q.eq("client_name", f.assistant).eq("playground", false);
  if (f.errorsOnly) q = q.in("status", ["error", "rejected"]);
  if (f.before) q = q.lt("at", f.before);

  const count = (build: (b: ReturnType<typeof base>) => PromiseLike<{ count: number | null }>) =>
    build(base()).then((r) => r.count ?? 0);
  const base = () => db.from("mcp_calls").select("id", { count: "exact", head: true });

  const [rowsRes, calls, callsBefore, errors, limited, sends, latRes] = await Promise.all([
    q,
    count((b) => b.gte("at", from)),
    count((b) => b.gte("at", since(now, 2 * windowMs)).lt("at", from)),
    count((b) => b.gte("at", from).in("status", ["error", "rejected"])),
    count((b) => b.gte("at", from).eq("status", "rejected")),
    count((b) => b.gte("at", from).eq("kind", "send").eq("status", "ok").eq("playground", false)),
    db
      .from("mcp_calls")
      .select("latency_ms")
      .gte("at", from)
      .not("latency_ms", "is", null)
      .order("at", { ascending: false })
      .limit(5000),
  ]);
  if (rowsRes.error) throw new Error(`mcp: reading activity failed: ${rowsRes.error.message}`);
  const raw = rowsRes.data ?? [];
  const more = raw.length > ACTIVITY_PAGE;
  const page = raw.slice(0, ACTIVITY_PAGE);

  const [emails, brands] = await Promise.all([
    emailsOf(
      db,
      page.map((r) => r.user_id),
    ),
    brandNames(
      db,
      page.flatMap((r) => (r.tenant_id ? [r.tenant_id] : [])),
    ),
  ]);
  const latencies = (latRes.data ?? [])
    .map((r) => r.latency_ms)
    .filter((n): n is number => n !== null)
    .sort((a, b) => a - b);

  const rows: ActivityRow[] = page.map((r) => ({
    id: r.id,
    at: r.at,
    tool: r.tool,
    brand: r.tenant_id ? (brands.get(r.tenant_id) ?? "Removed brand") : null,
    user: emails.get(r.user_id) ?? "Removed login",
    assistant: r.client_name || "Unknown",
    playground: r.playground,
    status: r.status,
    errorCode: r.error_code,
    latencyMs: r.latency_ms,
    args: r.args,
  }));
  const summary: ActivitySummary = {
    calls,
    callsBefore,
    errors,
    limited,
    medianMs: percentile(latencies, 50),
    p95Ms: percentile(latencies, 95),
    sends,
  };
  return { rows, more, oldest: page.at(-1)?.at ?? null, summary };
}

/** Brands for the activity filter: any brand with an AI-assistant switch, and test brands. */
export async function activityBrandOptions(db: ServiceClient) {
  const [{ data: flags }, { data: tests }] = await Promise.all([
    db.from("feature_flags").select("tenant_id").eq("key", MCP_FLAG).not("tenant_id", "is", null),
    db.from("tenants").select("id").eq("is_test", true),
  ]);
  const ids = [
    ...(flags ?? []).flatMap((r) => (r.tenant_id ? [r.tenant_id] : [])),
    ...(tests ?? []).map((r) => r.id),
  ];
  const names = await brandNames(db, ids);
  return [...names]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function brandNames(db: ServiceClient, ids: readonly string[]) {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map<string, string>();
  const { data } = await db.from("tenants").select("id, name, is_test").in("id", unique);
  return new Map((data ?? []).map((t) => [t.id, t.is_test ? `${t.name} (test)` : t.name]));
}

// ---------------- Switches ----------------

export interface SwitchRow {
  id: string;
  name: string;
  isTest: boolean;
  owner: string | null;
  on: boolean;
  connected: number;
  sendsToday: number;
  dailyCap: number | null;
}

export const SWITCHES_PAGE = 50;

/** The global switch row: none = on (flags.ts). */
export async function globalSwitch(db: ServiceClient): Promise<boolean> {
  const { data } = await db
    .from("feature_flags")
    .select("enabled")
    .eq("key", MCP_FLAG)
    .is("tenant_id", null)
    .maybeSingle();
  return data?.enabled ?? true;
}

/** Brands by name (search: name contains `q`), with their switch, connections and today's sends. */
export async function loadSwitches(db: ServiceClient, q: string, now: Date) {
  let tq = db
    .from("tenants")
    .select("id, name, is_test, mcp_daily_send_cap")
    .order("name")
    .limit(SWITCHES_PAGE + 1);
  const term = q
    .trim()
    .replace(/[%_,()]/g, " ")
    .trim();
  if (term) tq = tq.ilike("name", `%${term}%`);
  const { data: tenants, error } = await tq;
  if (error) throw new Error(`mcp: reading brands failed: ${error.message}`);
  const more = (tenants ?? []).length > SWITCHES_PAGE;
  const page = (tenants ?? []).slice(0, SWITCHES_PAGE);
  const ids = page.map((t) => t.id);
  if (!ids.length) return { rows: [] as SwitchRow[], more };

  const [{ data: flags }, { data: owners }, { data: grants }, { data: sends }] = await Promise.all([
    db.from("feature_flags").select("tenant_id, enabled").eq("key", MCP_FLAG).in("tenant_id", ids),
    db
      .from("tenant_members")
      .select("tenant_id, user_id, created_at")
      .in("tenant_id", ids)
      .order("created_at"),
    db.from("mcp_grants").select("tenant_ids").overlaps("tenant_ids", ids),
    db
      .from("mcp_calls")
      .select("tenant_id")
      .in("tenant_id", ids)
      .eq("kind", "send")
      .neq("status", "rejected")
      .neq("status", "error")
      .gte("at", since(now, DAY)),
  ]);
  const ownerOf = new Map<string, string>();
  for (const m of owners ?? []) if (!ownerOf.has(m.tenant_id)) ownerOf.set(m.tenant_id, m.user_id);
  const emails = await emailsOf(db, [...ownerOf.values()]);
  const tally = (list: string[]) => {
    const m = new Map<string, number>();
    for (const id of list) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  };
  const connected = tally((grants ?? []).flatMap((g) => g.tenant_ids));
  const sent = tally((sends ?? []).flatMap((s) => (s.tenant_id ? [s.tenant_id] : [])));
  const on = new Set((flags ?? []).filter((f) => f.enabled).map((f) => f.tenant_id));

  const rows: SwitchRow[] = page.map((t) => ({
    id: t.id,
    name: t.name,
    isTest: t.is_test,
    owner: emails.get(ownerOf.get(t.id) ?? "") ?? null,
    on: on.has(t.id),
    connected: connected.get(t.id) ?? 0,
    sendsToday: sent.get(t.id) ?? 0,
    dailyCap: t.mcp_daily_send_cap,
  }));
  return { rows, more };
}

async function upsertFlag(
  db: ServiceClient,
  tenantId: string | null,
  on: boolean,
  actorId: string,
) {
  // The unique index is on (key, coalesce(tenant_id, …)), which upsert can't target: replace.
  let del = db.from("feature_flags").delete().eq("key", MCP_FLAG);
  del = tenantId ? del.eq("tenant_id", tenantId) : del.is("tenant_id", null);
  const { error: e1 } = await del;
  if (e1) throw new Error(`mcp: changing a switch failed: ${e1.message}`);
  const { error: e2 } = await db
    .from("feature_flags")
    .insert({ key: MCP_FLAG, tenant_id: tenantId, enabled: on, updated_by: actorId });
  if (e2) throw new Error(`mcp: changing a switch failed: ${e2.message}`);
}

/** Everyone: off pauses every AI assistant; brand switches are kept. Who and when: the row. */
export async function setGlobalSwitch(db: ServiceClient, actorId: string, on: boolean) {
  await upsertFlag(db, null, on, actorId);
}

export async function setBrandSwitch(
  db: ServiceClient,
  actorId: string,
  tenantId: string,
  on: boolean,
): Promise<boolean> {
  const { data } = await db.from("tenants").select("id").eq("id", tenantId).maybeSingle();
  if (!data) return false;
  await upsertFlag(db, tenantId, on, actorId);
  await writeAudit(db, {
    tenantId,
    action: on ? "ai_assistants_switched_on" : "ai_assistants_switched_off",
    actor: actorId,
  });
  return true;
}

export async function setBrandDailyCap(
  db: ServiceClient,
  actorId: string,
  tenantId: string,
  cap: number | null,
): Promise<boolean> {
  const { data: before } = await db
    .from("tenants")
    .select("mcp_daily_send_cap")
    .eq("id", tenantId)
    .maybeSingle();
  if (!before) return false;
  if (before.mcp_daily_send_cap === cap) return true;
  const { error } = await db.from("tenants").update({ mcp_daily_send_cap: cap }).eq("id", tenantId);
  if (error) throw new Error(`mcp: saving the daily limit failed: ${error.message}`);
  await writeAudit(db, {
    tenantId,
    action: "ai_daily_limit_changed",
    actor: actorId,
    details: { from: before.mcp_daily_send_cap, to: cap },
  });
  return true;
}

// ---------------- Try it (playground) ----------------

export interface PlaygroundTarget {
  userId: string;
  email: string;
  brands: { id: string; name: string; on: boolean }[];
}

/** Who "Try it" can run as: the owners of test brands, with their test brands. */
export async function loadPlaygroundTargets(db: ServiceClient): Promise<PlaygroundTarget[]> {
  const { data: tests } = await db
    .from("tenants")
    .select("id, name")
    .eq("is_test", true)
    .order("name");
  if (!tests?.length) return [];
  const ids = tests.map((t) => t.id);
  const [{ data: members }, { data: flags }] = await Promise.all([
    db.from("tenant_members").select("tenant_id, user_id").in("tenant_id", ids),
    db
      .from("feature_flags")
      .select("tenant_id")
      .eq("key", MCP_FLAG)
      .eq("enabled", true)
      .in("tenant_id", ids),
  ]);
  const on = new Set((flags ?? []).map((f) => f.tenant_id));
  const emails = await emailsOf(
    db,
    (members ?? []).map((m) => m.user_id),
  );
  const byUser = new Map<string, PlaygroundTarget>();
  for (const t of tests) {
    for (const m of (members ?? []).filter((x) => x.tenant_id === t.id)) {
      const email = emails.get(m.user_id);
      if (!email) continue;
      const target = byUser.get(m.user_id) ?? { userId: m.user_id, email, brands: [] };
      target.brands.push({ id: t.id, name: t.name, on: on.has(t.id) });
      byUser.set(m.user_id, target);
    }
  }
  return [...byUser.values()].sort((a, b) => a.email.localeCompare(b.email));
}

export type PlaygroundResult =
  { ok: true; body: string; ms: number } | { ok: false; code: string; body: string; ms: number };

/**
 * One staff "Try it" run: the same callTool path as an AI assistant (switches, limits, log), as
 * the chosen owner, on one test brand only, marked as a playground run in mcp_calls and audit_log.
 */
export async function runPlayground(
  deps: McpDeps,
  req: {
    staffId: string;
    staffEmail: string;
    userId: string;
    tenantId: string;
    tool: string;
    input: string;
  },
): Promise<PlaygroundResult | { refused: string }> {
  const { db } = deps;
  const tool = toolByName(req.tool);
  if (!tool) return { refused: "That tool doesn't exist." };
  let args: unknown;
  try {
    args = req.input.trim() ? JSON.parse(req.input) : {};
  } catch {
    return { refused: "Input isn't valid JSON." };
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    return { refused: "Input must be a JSON object." };
  }
  const { data: brand } = await db
    .from("tenants")
    .select("id, is_test")
    .eq("id", req.tenantId)
    .maybeSingle();
  if (!brand?.is_test) return { refused: "Try it runs on test brands only." };
  const { data: member } = await db
    .from("tenant_members")
    .select("user_id")
    .eq("tenant_id", req.tenantId)
    .eq("user_id", req.userId)
    .maybeSingle();
  if (!member) return { refused: "That login doesn't own this brand." };

  // The brand is forced: a run can never reach another brand, whatever the input says.
  const input = "brand_id" in tool.input.shape ? { ...args, brand_id: req.tenantId } : args;
  const principal: McpPrincipal = {
    userId: req.userId,
    clientId: "playground",
    clientName: `Playground · ${req.staffEmail}`,
    brandIds: [req.tenantId],
  };
  await writeAudit(db, {
    tenantId: req.tenantId,
    action: "mcp_playground_run",
    actor: req.staffId,
    details: { tool: tool.name, as_user: req.userId },
  });
  const started = performance.now();
  const result = await callTool(tool, deps, principal, input, { playground: true });
  const ms = Math.round(performance.now() - started);
  const text = result.content[0]?.text ?? "{}";
  let body = text;
  try {
    body = JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    // Not JSON: show as is.
  }
  if (result.isError) {
    const code = (JSON.parse(text) as { error?: string }).error ?? "error";
    return { ok: false, code, body, ms };
  }
  return { ok: true, body, ms };
}
