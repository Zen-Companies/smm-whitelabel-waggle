import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { mcpEnabled, registerTools, SERVER_INSTRUCTIONS, verifyMcpToken } from "@/features/mcp";
import { getSocialProvider } from "@/lib/social";
import { getServiceClient } from "@/lib/supabase/service";

// Waggle's remote MCP server (docs/mcp/PLAN.md): Streamable HTTP, stateless. Thin: the tools live
// in features/mcp. Off unless MCP_ENABLED=true; every call needs a verified token.

const handler = createMcpHandler(
  (server) => registerTools(server, () => ({ db: getServiceClient(), social: getSocialProvider })),
  { serverInfo: { name: "waggle", version: "1.0.0" }, instructions: SERVER_INSTRUCTIONS },
);
const authed = withMcpAuth(handler, verifyMcpToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource/api/mcp",
});

async function route(req: Request): Promise<Response> {
  if (!mcpEnabled()) return new Response("Not found", { status: 404 });
  return authed(req);
}

export { route as GET, route as POST, route as DELETE };
