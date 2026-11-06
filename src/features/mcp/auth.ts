import type { AuthInfo } from "@modelcontextprotocol/server";
import { getServiceClient, type ServiceClient } from "@/lib/supabase/service";
import type { McpPrincipal } from "./context";

// Token verification for /api/mcp (docs/mcp/PLAN.md §4). AI assistants sign in through Supabase's
// OAuth 2.1 server; their access token is a Supabase JWT with a client_id claim. A token is
// accepted only if Supabase verifies it, it was issued by our project, it belongs to an OAuth
// client (a browser session has no client_id), and that user still has a grant row for that
// client: the brands come from the grant, so a disconnect or a brand change applies at once.

/** True when the MCP endpoint is switched on (env; per-brand switches come with Phase 3). */
export function mcpEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return env.MCP_ENABLED === "true";
}

/** Our project's issuer, e.g. https://<ref>.supabase.co/auth/v1. */
export const authIssuer = (env: Record<string, string | undefined> = process.env) =>
  `${(env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/$/, "")}/auth/v1`;

export interface TokenClaims {
  sub?: unknown;
  iss?: unknown;
  exp?: unknown;
  client_id?: unknown;
}

/** Pure: the user and client a verified token stands for, or null if it isn't an OAuth token of ours. */
export function oauthSubject(
  claims: TokenClaims | null,
  issuer: string,
): { userId: string; clientId: string; expiresAt?: number } | null {
  if (!claims) return null;
  if (typeof claims.sub !== "string" || !claims.sub) return null;
  if (typeof claims.client_id !== "string" || !claims.client_id) return null;
  if (claims.iss !== issuer) return null;
  return {
    userId: claims.sub,
    clientId: claims.client_id,
    expiresAt: typeof claims.exp === "number" ? claims.exp : undefined,
  };
}

export interface VerifyDeps {
  db: ServiceClient;
  /** Verifies the JWT's signature and expiry; null when it doesn't verify. */
  claimsOf(token: string): Promise<TokenClaims | null>;
  issuer: string;
}

export async function verifyWith(
  deps: VerifyDeps,
  token: string | undefined,
): Promise<AuthInfo | undefined> {
  if (!token) return undefined;
  const subject = oauthSubject(await deps.claimsOf(token), deps.issuer);
  if (!subject) return undefined;
  const { data: grant } = await deps.db
    .from("mcp_grants")
    .select("client_name, tenant_ids")
    .eq("user_id", subject.userId)
    .eq("client_id", subject.clientId)
    .maybeSingle();
  if (!grant) return undefined;
  const principal: McpPrincipal = {
    userId: subject.userId,
    clientId: subject.clientId,
    clientName: grant.client_name || "AI assistant",
    brandIds: grant.tenant_ids,
  };
  return {
    token,
    clientId: subject.clientId,
    scopes: [],
    expiresAt: subject.expiresAt,
    extra: { principal },
  };
}

/** The verifier `withMcpAuth` calls with each request's bearer token. */
export async function verifyMcpToken(
  _req: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  const db = getServiceClient();
  return verifyWith(
    {
      db,
      issuer: authIssuer(),
      async claimsOf(token) {
        const { data, error } = await db.auth.getClaims(token);
        return error || !data ? null : (data.claims as TokenClaims);
      },
    },
    bearerToken,
  );
}
