import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import { registerTools, SERVER_INSTRUCTIONS, verifyWith, type TokenClaims } from "@/features/mcp";
import { MockSocialProvider } from "@/lib/social/mock";
import { anonClient, serviceClient, uniqueEmail } from "./helpers";

// MCP over HTTP, as /api/mcp builds it: the 401 challenge, tools/list with annotations, and a
// tools/call. Only the JWT signature check is stubbed ("good-token" verifies); the grant lookup is
// real. The OAuth flow with real tokens is covered by mcp-oauth.test.ts.

const db = serviceClient();
const social = new MockSocialProvider();
const userIds: string[] = [];
let tenantId: string;
let userId: string;

const handler = createMcpHandler(
  (server) => registerTools(server, () => ({ db, social: () => social })),
  {
    serverInfo: { name: "waggle", version: "test" },
    instructions: SERVER_INSTRUCTIONS,
  },
);

beforeAll(async () => {
  const { data } = await anonClient().auth.signUp({
    email: uniqueEmail(),
    password: "password123",
  });
  userId = data.user!.id;
  userIds.push(userId);
  const { data: rows } = await db.rpc("create_owner_tenant", {
    p_user_id: userId,
    p_name: "Proto Cafe",
  });
  tenantId = rows![0].tenant_id;
  await db
    .from("mcp_grants")
    .insert({
      user_id: userId,
      client_id: "client-proto",
      client_name: "Claude",
      tenant_ids: [tenantId],
    });
});

afterAll(async () => {
  await db.from("tenants").delete().eq("id", tenantId);
  for (const id of userIds) await db.auth.admin.deleteUser(id);
});

// Verified claims for our user and client, standing in for Supabase's signature check.
const authed = withMcpAuth(
  handler,
  (_req, token) =>
    verifyWith(
      {
        db,
        issuer: `${inject("supabaseUrl")}/auth/v1`,
        claimsOf: async (t): Promise<TokenClaims | null> =>
          t === "good-token"
            ? { sub: userId, client_id: "client-proto", iss: `${inject("supabaseUrl")}/auth/v1` }
            : null,
      },
      token,
    ),
  { required: true, resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp" },
);

async function rpc(method: string, params: Record<string, unknown>, token?: string) {
  const res = await authed(
    new Request("https://waggle.test/api/mcp", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        "mcp-protocol-version": "2025-06-18",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
  );
  const text = await res.text();
  // A response may come as JSON or as one SSE event.
  const json = text.trim().startsWith("{")
    ? JSON.parse(text)
    : JSON.parse(
        text
          .split("\n")
          .find((l) => l.startsWith("data:"))!
          .slice(5),
      );
  return { status: res.status, headers: res.headers, json };
}

describe("/api/mcp over HTTP", () => {
  it("no token: 401 pointing at the resource metadata", async () => {
    const res = await authed(
      new Request("https://waggle.test/api/mcp", { method: "POST", body: "{}" }),
    );
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain(
      'resource_metadata="https://waggle.test/.well-known/oauth-protected-resource/api/mcp"',
    );
  });

  it("a token that doesn't verify: 401", async () => {
    const res = await authed(
      new Request("https://waggle.test/api/mcp", {
        method: "POST",
        headers: { authorization: "Bearer forged" },
        body: "{}",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("tools/list: the 14 tools with titles and annotations", async () => {
    const { status, json } = await rpc("tools/list", {}, "good-token");
    expect(status).toBe(200);
    const tools = json.result.tools as {
      name: string;
      title?: string;
      annotations?: Record<string, unknown>;
    }[];
    expect(tools).toHaveLength(14);
    const approve = tools.find((t) => t.name === "approve_reply")!;
    expect(approve.title).toBe("Approve a reply");
    expect(approve.annotations).toMatchObject({ destructiveHint: true, openWorldHint: true });
  });

  it("tools/call: list_brands returns the granted brand as structured content", async () => {
    const { json } = await rpc("tools/call", { name: "list_brands", arguments: {} }, "good-token");
    expect(json.result.isError).toBeFalsy();
    expect(
      json.result.structuredContent.brands.map((b: { brand_id: string }) => b.brand_id),
    ).toEqual([tenantId]);
  });
});
