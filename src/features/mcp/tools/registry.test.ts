import { describe, expect, it } from "vitest";
import { TOOLS } from "./registry";

// The registry is the contract with Claude, ChatGPT and Grok (docs/mcp/PLAN.md §3).
describe("MCP tool registry", () => {
  it("has the 14 planned tools, unique snake_case names, a title and a description each", () => {
    expect(TOOLS.map((t) => t.name).sort()).toEqual(
      [
        "approve_reply",
        "cancel_post",
        "create_post",
        "get_analytics",
        "get_conversation",
        "get_post_performance",
        "hide_comment",
        "list_brands",
        "list_inbox",
        "list_posts",
        "resolve_item",
        "search_knowledge",
        "undo_reply",
        "write_reply",
      ].sort(),
    );
    for (const t of TOOLS) {
      expect(t.name).toMatch(/^[a-z]+(_[a-z]+)*$/);
      expect(t.title.length).toBeGreaterThan(3);
      expect(t.description.length).toBeGreaterThan(40);
    }
  });

  it("annotations match what a tool does", () => {
    for (const t of TOOLS) {
      if (t.access === "read") {
        expect(t.annotations, t.name).toMatchObject({ readOnlyHint: true, destructiveHint: false });
      } else {
        expect(t.annotations.readOnlyHint, t.name).toBe(false);
      }
      // Anything that reaches Instagram/Facebook is destructive, so hosts ask the user first.
      if (t.annotations.openWorldHint) expect(t.annotations.destructiveHint, t.name).toBe(true);
    }
    const publicActions = TOOLS.filter((t) => t.annotations.openWorldHint).map((t) => t.name);
    expect(publicActions.sort()).toEqual(
      ["approve_reply", "cancel_post", "create_post", "hide_comment", "write_reply"].sort(),
    );
  });

  it("every tool but list_brands is brand-scoped, and none takes a user or tenant id", () => {
    for (const t of TOOLS) {
      const keys = Object.keys(t.input.shape);
      if (t.name === "list_brands") expect(keys).toEqual([]);
      else expect(keys, t.name).toContain("brand_id");
      expect(
        keys.some((k) => /user|tenant/.test(k)),
        t.name,
      ).toBe(false);
    }
  });

  it("tools that return customer text say it is untrusted", () => {
    for (const t of TOOLS) {
      const json = JSON.stringify(t.output.toJSONSchema());
      if (json.includes("customer_text")) expect(t.description, t.name).toMatch(/untrusted/i);
    }
  });

  it("schemas convert to JSON Schema (what clients see in tools/list)", () => {
    for (const t of TOOLS) {
      expect(() => t.input.toJSONSchema(), t.name).not.toThrow();
      expect(() => t.output.toJSONSchema(), t.name).not.toThrow();
    }
  });
});
