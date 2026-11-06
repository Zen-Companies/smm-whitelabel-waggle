import type { AuthInfo } from "@modelcontextprotocol/server";

// Token verification for /api/mcp (docs/mcp/PLAN.md §4). Phase 2 verifies Supabase OAuth tokens
// (JWKS, issuer, client_id) and loads the brand grant into `extra.principal`. Until then no token
// is accepted, so the endpoint answers 401 to everyone.

/** True when the MCP endpoint is switched on (env; per-brand switches come with Phase 3). */
export function mcpEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.MCP_ENABLED === "true";
}

export async function verifyMcpToken(): Promise<AuthInfo | undefined> {
  return undefined;
}
