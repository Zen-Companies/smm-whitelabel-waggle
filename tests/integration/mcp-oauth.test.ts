import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it, inject } from "vitest";
import {
  callTool,
  deleteGrant,
  saveGrant,
  toolByName,
  verifyWith,
  type McpPrincipal,
  type TokenClaims,
} from "@/features/mcp";
import { MockSocialProvider } from "@/lib/social/mock";
import type { Database } from "@/lib/supabase/database.types";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// MCP Phase 2 (docs/mcp/PLAN.md §4): the whole sign-in against local Supabase's OAuth 2.1 server
// (supabase/config.toml [auth.oauth_server]): an assistant registers itself, the user approves
// on our consent step (grant + approveAuthorization), the code becomes tokens with PKCE, the
// token opens the MCP tools but not the Data API, refresh works, and a disconnect ends it.

const url = inject("supabaseUrl");
const auth = `${url}/auth/v1`;
const db = serviceClient();
const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const userIds: string[] = [];
const tenantIds: string[] = [];

const deps = {
  db,
  issuer: auth,
  async claimsOf(token: string) {
    const { data, error } = await db.auth.getClaims(token);
    return error || !data ? null : (data.claims as TokenClaims);
  },
};

const b64url = (b: Buffer) => b.toString("base64url");

let email: string;
let userId: string;
let cafeId: string;
let floristId: string;
let clientId: string;
let access: string;
let refresh: string;

async function form(path: string, body: Record<string, string>) {
  const res = await fetch(`${auth}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body),
  });
  return { status: res.status, json: (await res.json()) as Record<string, string> };
}

beforeAll(async () => {
  process.env.MCP_ENABLED = "true";
  email = uniqueEmail();
  const { data } = await anonClient().auth.signUp({ email, password: "password123" });
  userId = data.user!.id;
  userIds.push(userId);
  const { data: a } = await db.rpc("create_owner_tenant", { p_user_id: userId, p_name: "Cafe" });
  const { data: b } = await db.rpc("create_brand", { p_user_id: userId, p_name: "Florist" });
  cafeId = a![0].tenant_id;
  floristId = b![0].tenant_id;
  tenantIds.push(cafeId, floristId);
  await db
    .from("feature_flags")
    .insert([cafeId, floristId].map((t) => ({ key: "mcp", tenant_id: t, enabled: true })));
});

afterAll(async () => {
  for (const id of tenantIds) await db.from("tenants").delete().eq("id", id);
  for (const id of userIds) await db.auth.admin.deleteUser(id);
});

describe("an AI assistant signs in and uses Waggle", () => {
  it("registers itself, the owner approves one brand, the code becomes tokens (PKCE S256)", async () => {
    const reg = await fetch(`${auth}/oauth/clients/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        client_name: "Claude",
        redirect_uris: [REDIRECT],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      }),
    });
    expect(reg.status).toBe(201);
    clientId = ((await reg.json()) as { client_id: string }).client_id;

    const verifier = b64url(randomBytes(32));
    const challenge = b64url(createHash("sha256").update(verifier).digest());
    const start = await fetch(
      `${auth}/oauth/authorize?${new URLSearchParams({
        response_type: "code",
        client_id: clientId,
        redirect_uri: REDIRECT,
        code_challenge: challenge,
        code_challenge_method: "S256",
        state: "s1",
      })}`,
      { redirect: "manual" },
    );
    const consentUrl = new URL(start.headers.get("location")!, url);
    expect(consentUrl.pathname).toBe("/oauth/consent");
    const authorizationId = consentUrl.searchParams.get("authorization_id")!;

    // What the consent page does, as the signed-in owner.
    const owner = createClient<Database>(url, inject("supabaseAnonKey"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await owner.auth.signInWithPassword({ email, password: "password123" });
    const { data: details } = await owner.auth.oauth.getAuthorizationDetails(authorizationId);
    expect(details && "authorization_id" in details).toBe(true);
    if (!details || !("authorization_id" in details)) return;
    expect(details.redirect_uri).toBe(REDIRECT);
    expect(
      await saveGrant(db, {
        userId,
        clientId: details.client.id,
        clientName: "Claude",
        brandIds: [cafeId],
      }),
    ).toEqual({ ok: true });
    const { data: approved } = await owner.auth.oauth.approveAuthorization(authorizationId, {
      skipBrowserRedirect: true,
    });
    const back = new URL(approved!.redirect_url);
    expect(`${back.origin}${back.pathname}`).toBe(REDIRECT);
    expect(back.searchParams.get("state")).toBe("s1");

    const tokens = await form("/oauth/token", {
      grant_type: "authorization_code",
      code: back.searchParams.get("code")!,
      redirect_uri: REDIRECT,
      client_id: clientId,
      code_verifier: verifier,
    });
    expect(tokens.status).toBe(200);
    access = tokens.json.access_token;
    refresh = tokens.json.refresh_token;
    expect(access).toBeTruthy();
  });

  it("the token opens the tools, for the approved brand only", async () => {
    const info = await verifyWith(deps, access);
    const principal = info?.extra?.principal as McpPrincipal;
    expect(principal).toMatchObject({ userId, clientId, clientName: "Claude", brandIds: [cafeId] });
    const social = new MockSocialProvider();
    const r = await callTool(
      toolByName("list_brands")!,
      { db, social: () => social },
      principal,
      {},
    );
    expect(
      (r.structuredContent as { brands: { brand_id: string }[] }).brands.map((b) => b.brand_id),
    ).toEqual([cafeId]);
    const other = await callTool(
      toolByName("list_inbox")!,
      { db, social: () => social },
      principal,
      { brand_id: floristId },
    );
    expect(JSON.parse(other.content[0].text).error).toBe("brand_not_allowed");
  });

  it("the same token reads nothing straight from the Data API", async () => {
    const direct = createClient<Database>(url, inject("supabaseAnonKey"), {
      accessToken: async () => access,
    });
    const { data } = await direct.from("tenants").select("id");
    expect(data ?? []).toEqual([]);
  });

  it("a browser session token is not an MCP token; nor is garbage", async () => {
    const { data } = await anonClient().auth.signInWithPassword({ email, password: "password123" });
    expect(await verifyWith(deps, data.session!.access_token)).toBeUndefined();
    expect(await verifyWith(deps, "not-a-jwt")).toBeUndefined();
    expect(await verifyWith(deps, undefined)).toBeUndefined();
  });

  it("refresh gives a working token", async () => {
    const next = await form("/oauth/token", {
      grant_type: "refresh_token",
      refresh_token: refresh,
      client_id: clientId,
    });
    expect(next.status).toBe(200);
    access = next.json.access_token;
    refresh = next.json.refresh_token ?? refresh;
    expect(await verifyWith(deps, access)).toBeDefined();
  });

  it("disconnect: the grant row goes, so the token stops at once; refresh is revoked", async () => {
    const owner = createClient<Database>(url, inject("supabaseAnonKey"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    await owner.auth.signInWithPassword({ email, password: "password123" });
    const { error } = await owner.auth.oauth.revokeGrant({ clientId });
    expect(error).toBeNull();
    await deleteGrant(db, { userId, clientId });
    expect(await verifyWith(deps, access)).toBeUndefined();
    const again = await form("/oauth/token", {
      grant_type: "refresh_token",
      refresh_token: refresh,
      client_id: clientId,
    });
    expect(again.status).not.toBe(200);
    const { data: audit } = await db
      .from("audit_log")
      .select("action")
      .eq("tenant_id", cafeId)
      .in("action", ["ai_assistant_connected", "ai_assistant_removed"])
      .order("created_at");
    expect(audit?.map((a) => a.action)).toEqual(["ai_assistant_connected", "ai_assistant_removed"]);
  });
});
