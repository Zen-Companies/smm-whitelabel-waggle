import { describe, expect, it } from "vitest";
import {
  assistantName,
  DEFAULT_REDIRECT_URIS,
  redirectAllowed,
  redirectAllowlist,
} from "./redirects";

const ok = (uri: string) => redirectAllowed(uri, DEFAULT_REDIRECT_URIS);

describe("redirectAllowed", () => {
  it("accepts Claude, Claude Code on any port, and ChatGPT", () => {
    expect(ok("https://claude.ai/api/mcp/auth_callback")).toBe(true);
    expect(ok("http://localhost:53122/callback")).toBe(true);
    expect(ok("http://127.0.0.1:8080/callback")).toBe(true);
    expect(ok("https://chatgpt.com/connector_platform_oauth_redirect")).toBe(true);
    expect(ok("https://chatgpt.com/connector/oauth/abc_123")).toBe(true);
  });

  it("refuses look-alikes and anything else", () => {
    expect(ok("https://claude.ai.evil.com/api/mcp/auth_callback")).toBe(false);
    expect(ok("https://evil.com/api/mcp/auth_callback")).toBe(false);
    expect(ok("http://claude.ai/api/mcp/auth_callback")).toBe(false);
    expect(ok("https://claude.ai/api/mcp/auth_callback/extra")).toBe(false);
    expect(ok("https://chatgpt.com/connector/oauth/a/b")).toBe(false);
    expect(ok("http://localhost/callback")).toBe(false);
    expect(ok("https://user:pw@claude.ai/api/mcp/auth_callback")).toBe(false);
    expect(ok("not a url")).toBe(false);
  });

  it("the env list replaces the defaults", () => {
    expect(redirectAllowlist({ MCP_REDIRECT_URIS: " https://grok.com/cb , " })).toEqual([
      "https://grok.com/cb",
    ]);
    expect(redirectAllowlist({})).toEqual([...DEFAULT_REDIRECT_URIS]);
  });
});

it("assistantName falls back to the redirect host", () => {
  expect(assistantName("  Claude  ", "https://claude.ai/x")).toBe("Claude");
  expect(assistantName("", "https://chatgpt.com/connector/oauth/a")).toBe("ChatGPT");
  expect(assistantName(null, "https://grok.com/cb")).toBe("grok.com");
});
