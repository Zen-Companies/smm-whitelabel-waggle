// Which AI assistants may connect (docs/mcp/PLAN.md §4.5). Supabase lets any client register
// itself (DCR), so our consent page only continues when the client's redirect URI is one of the
// assistants we support. Sources (checked 2026-11-06):
// - Claude: https://claude.com/docs/connectors/building/authentication.md
// - ChatGPT: https://developers.openai.com/apps-sdk/build/auth
// - Grok: not documented (https://docs.x.ai/grok/connectors); add it to MCP_REDIRECT_URIS once seen.

/** `*` matches one path segment (or a port). */
export const DEFAULT_REDIRECT_URIS = [
  "https://claude.ai/api/mcp/auth_callback",
  "http://localhost:*/callback",
  "http://127.0.0.1:*/callback",
  "https://chatgpt.com/connector_platform_oauth_redirect",
  "https://chatgpt.com/connector/oauth/*",
] as const;

/** The allowlist: MCP_REDIRECT_URIS (comma-separated) replaces the defaults when set. */
export function redirectAllowlist(env: Record<string, string | undefined> = process.env): string[] {
  const raw = env.MCP_REDIRECT_URIS?.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return raw?.length ? raw : [...DEFAULT_REDIRECT_URIS];
}

const escape = (s: string) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&");

/** Pure: the redirect URI (without query) matches a pattern exactly, `*` = one segment. */
export function redirectAllowed(uri: string, patterns: readonly string[]): boolean {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }
  if (parsed.username || parsed.password || parsed.hash) return false;
  const base = `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
  return patterns.some((p) =>
    new RegExp(`^${escape(p).replace(/\*/g, "[A-Za-z0-9_-]+")}$`).test(base),
  );
}

/** Display name for the assistant, from the redirect host when the client gave none. */
export function assistantName(clientName: string | null | undefined, redirectUri: string): string {
  const name = clientName?.trim();
  if (name) return name.slice(0, 80);
  try {
    const host = new URL(redirectUri).hostname;
    if (host === "claude.ai" || host === "localhost" || host === "127.0.0.1") return "Claude";
    if (host === "chatgpt.com") return "ChatGPT";
    return host;
  } catch {
    return "AI assistant";
  }
}
