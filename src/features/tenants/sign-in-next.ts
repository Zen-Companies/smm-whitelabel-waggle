/**
 * Where sign-in continues: back to an AI assistant's consent page (MCP, docs/mcp/PLAN.md §4.2)
 * when it sent the user here, else Settings. Nothing else is followed (no open redirect).
 */
export function signInNext(next: FormDataEntryValue | null): string {
  return typeof next === "string" &&
    /^\/oauth\/consent\?authorization_id=[A-Za-z0-9_-]{1,100}$/.test(next)
    ? next
    : "/settings";
}
