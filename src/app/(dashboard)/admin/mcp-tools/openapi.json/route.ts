import { buildOpenApi, TOOLS } from "@/features/mcp";
import { hasPermission } from "@/features/staff";

// The tool registry as OpenAPI 3.1 (staff "MCP tools" → "OpenAPI spec"). Staff only: 404 otherwise.
export async function GET(req: Request) {
  if (!(await hasPermission("mcp.docs.view"))) return new Response("Not found", { status: 404 });
  return Response.json(buildOpenApi(TOOLS, new URL(req.url).origin), {
    headers: { "Cache-Control": "private, no-store" },
  });
}
