import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ToolError, type McpDeps } from "./context";
import { principalFrom, runTool } from "./server";
import { defineTool, READ } from "./tools/define";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

const tool = (run: () => Promise<{ ok: boolean }>) =>
  defineTool({
    name: "t",
    title: "Test",
    description: "Test tool.",
    access: "read",
    annotations: READ,
    wraps: "test",
    input: z.object({}),
    output: z.object({ ok: z.boolean() }),
    run,
  });
const deps = {} as McpDeps;
const principal = { userId: "u1", clientId: "c1", clientName: "Claude", brandIds: ["b1"] };

describe("runTool", () => {
  it("returns JSON text and structuredContent", async () => {
    const r = await runTool(
      tool(async () => ({ ok: true })),
      deps,
      principal,
      {},
    );
    expect(r).toEqual({
      content: [{ type: "text", text: JSON.stringify({ ok: true }) }],
      structuredContent: { ok: true },
    });
  });

  it("no principal: refused before running", async () => {
    const run = vi.fn(async () => ({ ok: true }));
    const r = await runTool(tool(run), deps, null, {});
    expect(r.isError).toBe(true);
    expect(run).not.toHaveBeenCalled();
  });

  it("a refusal keeps its code and message", async () => {
    const r = await runTool(
      tool(async () => {
        throw new ToolError("not_found", "No such message for this brand.");
      }),
      deps,
      principal,
      {},
    );
    expect(r.isError).toBe(true);
    expect(JSON.parse(r.content[0].text)).toEqual({
      error: "not_found",
      message: "No such message for this brand.",
    });
  });

  it("an unexpected error never leaks its message", async () => {
    const r = await runTool(
      tool(async () => {
        throw new Error("relation inbound_items: secret detail");
      }),
      deps,
      principal,
      {},
    );
    expect(r.content[0].text).not.toContain("secret");
    expect(JSON.parse(r.content[0].text).error).toBe("internal");
  });
});

describe("principalFrom", () => {
  it("reads the principal the auth layer attached, nothing else", () => {
    const info = (extra: Record<string, unknown>) => ({
      token: "x",
      clientId: "c1",
      scopes: [],
      extra,
    });
    expect(principalFrom(info({ principal }))).toEqual(principal);
    expect(principalFrom(undefined)).toBeNull();
    expect(principalFrom(info({}))).toBeNull();
  });
});
