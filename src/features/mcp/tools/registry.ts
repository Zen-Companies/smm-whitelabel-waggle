import { CONTENT_TOOLS } from "./content";
import type { McpTool } from "./define";
import { INBOX_TOOLS } from "./inbox";

// The single source of truth for Waggle's MCP tools (docs/mcp/PLAN.md §3): the server registers
// these, validates with their schemas, and the staff docs are generated from them.

export const TOOLS: readonly McpTool[] = [...INBOX_TOOLS, ...CONTENT_TOOLS];

export const toolByName = (name: string) => TOOLS.find((t) => t.name === name);
