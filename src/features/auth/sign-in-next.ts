/**
 * Where sign-in continues: back to an AI assistant's consent page (MCP, docs/mcp/PLAN.md §4.2)
 * or to an invite link (T56) when one sent the user here, else Settings. Nothing else is
 * followed (no open redirect).
 */
export function signInNext(next: FormDataEntryValue | null): string {
  if (typeof next !== "string") return "/settings";
  if (/^\/oauth\/consent\?authorization_id=[A-Za-z0-9_-]{1,100}$/.test(next)) return next;
  if (/^\/invite\/[A-Za-z0-9_-]{20,100}$/.test(next)) return next;
  return "/settings";
}
