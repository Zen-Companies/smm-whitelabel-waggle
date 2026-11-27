import { CONTENT_TOOLS } from "./content";
import type { McpTool } from "./define";
import { INBOX_TOOLS } from "./inbox";
import { POST_CHANGE_TOOLS } from "./post-changes";
import { POSTING_TOOLS } from "./posting";
import { TEACH_LEAD_TOOLS } from "./teach-leads";
import { WEEK_TOOLS } from "./week";

// The single source of truth for Waggle's MCP tools (docs/mcp/PLAN.md §3): the server registers
// these, validates with their schemas, and the staff docs are generated from them.

export const TOOLS: readonly McpTool[] = [
  ...INBOX_TOOLS,
  ...POSTING_TOOLS,
  ...POST_CHANGE_TOOLS,
  ...CONTENT_TOOLS,
  ...TEACH_LEAD_TOOLS,
  ...WEEK_TOOLS,
];

export const toolByName = (name: string) => TOOLS.find((t) => t.name === name);
