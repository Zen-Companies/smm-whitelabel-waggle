import {
  getPublicOrigin,
  metadataCorsOptionsRequestHandler,
  protectedResourceHandler,
} from "mcp-handler";
import { authIssuer, mcpEnabled } from "@/features/mcp";

// RFC 9728 protected resource metadata for /api/mcp (docs/mcp/PLAN.md §4): tells an AI assistant
// which authorization server (our Supabase project) issues tokens for it. Served at the path-
// suffixed address the 401 points to (/.well-known/oauth-protected-resource/api/mcp) and at the
// root one; `resource` is always the MCP URL itself, which Claude requires to match exactly.

export function GET(req: Request): Response {
  if (!mcpEnabled()) return new Response("Not found", { status: 404 });
  return protectedResourceHandler({
    authServerUrls: [authIssuer()],
    resourceUrl: `${getPublicOrigin(req)}/api/mcp`,
  })(req);
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
