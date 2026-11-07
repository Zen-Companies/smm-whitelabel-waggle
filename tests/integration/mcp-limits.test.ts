import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  callTool,
  limitsFromEnv,
  pruneCalls,
  toolByName,
  type McpLimits,
  type McpPrincipal,
} from "@/features/mcp";
import { MockSocialProvider } from "@/lib/social/mock";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// MCP Phase 3 (docs/mcp/PLAN.md §5.3, §7): the switches, the activity log and the send limits,
// through callTool as /api/mcp runs it. Test files run one at a time, so the global switch can be
// flipped here and put back.

const db = serviceClient();
const social = new MockSocialProvider();
const deps = { db, social: () => social };
const userIds: string[] = [];
const tenantIds: string[] = [];
let userId: string;
let onBrand: { tenantId: string; accountId: string };
let offBrand: { tenantId: string; accountId: string };
let p: McpPrincipal;

async function brand(name: string, first: boolean) {
  const { data } = first
    ? await db.rpc("create_owner_tenant", { p_user_id: userId, p_name: name })
    : await db.rpc("create_brand", { p_user_id: userId, p_name: name });
  const tenantId = data![0].tenant_id as string;
  tenantIds.push(tenantId);
  const { data: account } = await db
    .from("social_accounts")
    .insert({
      tenant_id: tenantId,
      zernio_account_id: `acc_${randomUUID().slice(0, 8)}`,
      platform: "instagram",
    })
    .select("id")
    .single();
  return { tenantId, accountId: account!.id };
}

const call = async (name: string, args: Record<string, unknown>, limits?: Partial<McpLimits>) => {
  const r = await callTool(toolByName(name)!, deps, p, args, {
    limits: { ...limitsFromEnv({}), ...limits },
  });
  return r.isError
    ? { error: JSON.parse(r.content[0].text).error as string }
    : (r.structuredContent as Record<string, unknown>);
};
const later = () => new Date(Date.now() + 2 * 60 * 60_000).toISOString();
const calls = async (tenantId: string) =>
  (
    await db
      .from("mcp_calls")
      .select("tool, kind, status, error_code, args, latency_ms, client_name")
      .eq("tenant_id", tenantId)
      .order("at")
  ).data ?? [];

beforeAll(async () => {
  process.env.MCP_ENABLED = "true";
  const { data } = await anonClient().auth.signUp({
    email: uniqueEmail(),
    password: "password123",
  });
  userId = data.user!.id;
  userIds.push(userId);
  onBrand = await brand("Switched On Cafe", true);
  offBrand = await brand("Switched Off Bakery", false);
  await db.from("feature_flags").insert({ key: "mcp", tenant_id: onBrand.tenantId, enabled: true });
  p = {
    userId,
    clientId: "client-limits",
    clientName: "Claude",
    brandIds: [onBrand.tenantId, offBrand.tenantId],
  };
});

afterAll(async () => {
  await db.from("feature_flags").delete().eq("key", "mcp").is("tenant_id", null);
  for (const id of tenantIds) await db.from("tenants").delete().eq("id", id);
  for (const id of userIds) await db.auth.admin.deleteUser(id);
});

describe("switches", () => {
  it("a brand that's off is left out of list_brands and refused by every tool", async () => {
    const out = (await call("list_brands", {})) as { brands: { brand_id: string }[] };
    expect(out.brands.map((b) => b.brand_id)).toEqual([onBrand.tenantId]);
    expect(await call("list_inbox", { brand_id: offBrand.tenantId })).toEqual({
      error: "brand_not_allowed",
    });
  });

  it("switched off for everyone: every tool answers unavailable, until it's back on", async () => {
    await db.from("feature_flags").insert({ key: "mcp", tenant_id: null, enabled: false });
    expect(await call("list_brands", {})).toEqual({ error: "unavailable" });
    await db.from("feature_flags").delete().eq("key", "mcp").is("tenant_id", null);
    expect(await call("list_brands", {})).toHaveProperty("brands");
  });
});

describe("activity log", () => {
  it("logs each call with its outcome; free text never stored", async () => {
    await call("search_knowledge", { brand_id: onBrand.tenantId, query: "secret parking spot" });
    const rows = await calls(onBrand.tenantId);
    const row = rows.find((r) => r.tool === "search_knowledge")!;
    expect(row).toMatchObject({
      kind: "read",
      status: "ok",
      error_code: null,
      client_name: "Claude",
    });
    expect(row.latency_ms).toBeGreaterThanOrEqual(0);
    expect(row.args).toEqual({ brand_id: onBrand.tenantId, query: "[text, 19 chars]" });
    expect(JSON.stringify(rows)).not.toContain("secret");
  });

  it("a refused tool call is logged as an error with its code", async () => {
    await call("get_conversation", { brand_id: onBrand.tenantId, item_id: randomUUID() });
    const row = (await calls(onBrand.tenantId)).find((r) => r.tool === "get_conversation")!;
    expect(row).toMatchObject({ status: "error", error_code: "not_found" });
  });
});

describe("send limits", () => {
  it("burst: the third post in 10 minutes is refused when the limit is 2", async () => {
    const post = () =>
      call(
        "create_post",
        {
          brand_id: onBrand.tenantId,
          content: "Fresh bread",
          account_ids: [onBrand.accountId],
          publish_at: later(),
        },
        { burstSends: 2 },
      );
    expect(await post()).toHaveProperty("post_id");
    expect(await post()).toHaveProperty("post_id");
    expect(await post()).toEqual({ error: "rate_limited" });
    const { count } = await db
      .from("posts")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", onBrand.tenantId);
    expect(count).toBe(2);
    const sends = (await calls(onBrand.tenantId)).filter((r) => r.kind === "send");
    expect(sends.map((r) => r.status)).toEqual(["ok", "ok", "rejected"]);
  });

  it("daily: the brand's own limit applies, and reads still work at the limit", async () => {
    await db.from("tenants").update({ mcp_daily_send_cap: 2 }).eq("id", onBrand.tenantId);
    // Two sends already counted today (the refused one doesn't count).
    expect(
      await call(
        "create_post",
        {
          brand_id: onBrand.tenantId,
          content: "More bread",
          account_ids: [onBrand.accountId],
          publish_at: later(),
        },
        { burstSends: 50 },
      ),
    ).toEqual({ error: "daily_limit" });
    expect(await call("list_posts", { brand_id: onBrand.tenantId })).toHaveProperty("posts");
  });
});

it("the activity log keeps 90 days", async () => {
  const old = new Date(Date.now() - 91 * 24 * 60 * 60_000).toISOString();
  await db.from("mcp_calls").insert({
    at: old,
    user_id: userId,
    client_id: "client-limits",
    tenant_id: onBrand.tenantId,
    tool: "list_inbox",
    kind: "read",
    status: "ok",
  });
  expect(await pruneCalls(db, new Date())).toBeGreaterThanOrEqual(1);
  const { count } = await db
    .from("mcp_calls")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", onBrand.tenantId)
    .lt("at", new Date(Date.now() - 90 * 24 * 60 * 60_000).toISOString());
  expect(count).toBe(0);
});
