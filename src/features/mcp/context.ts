import { can, isOrgRole, ROLE_LABEL, type Ability } from "@/features/orgs";
import type { SocialProvider } from "@/lib/social/types";
import type { ServiceClient } from "@/lib/supabase/service";
import { mcpBrandsOn } from "./flags";

// Who is calling a tool (docs/mcp/PLAN.md §4.2). Built by the auth layer from a verified token:
// never from tool arguments. `brandIds` are the brands the user ticked when connecting this AI
// assistant; each call is checked against them AND the user's current memberships.

export interface McpPrincipal {
  userId: string;
  /** The OAuth client id of the AI assistant (or "playground" for staff runs). */
  clientId: string;
  /** Shown in the audit trail, e.g. "Claude". */
  clientName: string;
  brandIds: readonly string[];
}

export interface McpDeps {
  db: ServiceClient;
  social: () => SocialProvider;
  now?: () => Date;
}

export interface ToolContext extends McpDeps {
  principal: McpPrincipal;
  /** T58: what the tool does, checked against the user's role in the brand (set by defineTool). */
  requires?: Ability;
}

/** A tool refused the call: the AI sees `code` and `message`, never internals. */
export class ToolError extends Error {
  constructor(
    readonly code: ToolErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ToolError";
  }
}

export type ToolErrorCode =
  | "brand_required"
  | "brand_not_allowed"
  | "role_not_allowed"
  | "not_found"
  | "already_decided"
  | "invalid_input"
  | "provider_failed"
  | "daily_limit"
  | "rate_limited"
  | "unavailable";

/** The `via` written into audit rows for actions an AI assistant took. */
export const viaOf = (p: McpPrincipal) => ({ mcpClientId: p.clientId, clientName: p.clientName });

/**
 * The brand a call acts on. It must be one the user ticked for this assistant, one they still own
 * (a removed membership wins over an old grant), and switched on for AI assistants (flags.ts).
 * Omitted: allowed when exactly one is ticked.
 */
export async function resolveBrand(ctx: ToolContext, brandId: string | undefined): Promise<string> {
  const { principal } = ctx;
  const id = brandId ?? (principal.brandIds.length === 1 ? principal.brandIds[0] : undefined);
  if (!id) {
    throw new ToolError("brand_required", "Pass brand_id. Call list_brands to see the brands.");
  }
  if (!principal.brandIds.includes(id)) {
    throw new ToolError(
      "brand_not_allowed",
      "This brand isn't shared with this assistant. Call list_brands; the owner can add brands in Waggle Settings → AI assistants.",
    );
  }
  const { data } = await ctx.db
    .from("tenant_members")
    .select("tenant_id, role")
    .eq("tenant_id", id)
    .eq("user_id", principal.userId)
    .maybeSingle();
  if (!data) {
    throw new ToolError("brand_not_allowed", "This brand isn't available to this login any more.");
  }
  // T58: the assistant can do what the user's role in this brand can do, nothing more.
  if (ctx.requires) {
    const role = isOrgRole(data.role) ? data.role : null;
    if (!can(role, ctx.requires)) {
      throw new ToolError(
        "role_not_allowed",
        `This login is ${role ? `${role === "admin" || role === "owner" ? "an" : "a"} ${ROLE_LABEL[role]}` : "not a member"} of this brand, which can't do that. It can still read. An Owner or Admin can change the role in Waggle Settings → Team.`,
      );
    }
  }
  if (!(await mcpBrandsOn(ctx.db, [id])).has(id)) {
    throw new ToolError("brand_not_allowed", "AI assistants aren't turned on for this brand yet.");
  }
  return id;
}
