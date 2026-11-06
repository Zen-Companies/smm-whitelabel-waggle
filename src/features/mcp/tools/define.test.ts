import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ToolError, type ToolContext } from "../context";
import { clip, defineTool, pageOf, READ } from "./define";

describe("pageOf", () => {
  const all = Array.from({ length: 45 }, (_, i) => i);
  it("pages of 20 with a cursor until the end", () => {
    expect(pageOf(all, undefined)).toEqual({ page: all.slice(0, 20), next_cursor: "20" });
    expect(pageOf(all, "40")).toEqual({ page: [40, 41, 42, 43, 44], next_cursor: null });
  });
});

it("clip shortens long text with an ellipsis", () => {
  expect(clip("abcdef", 4)).toBe("abc…");
  expect(clip(null, 4)).toBe("");
  expect(clip("abc", 4)).toBe("abc");
});

describe("defineTool", () => {
  const tool = defineTool({
    name: "echo",
    title: "Echo",
    description: "Returns n.",
    access: "read",
    annotations: READ,
    wraps: "test",
    input: z.object({ n: z.number().int().min(1) }),
    output: z.object({ n: z.number() }),
    run: async (_ctx, input) => ({ n: input.n }),
  });
  const ctx = {} as ToolContext;
  it("validates input before running", async () => {
    await expect(tool.run(ctx, { n: 2 })).resolves.toEqual({ n: 2 });
    await expect(tool.run(ctx, { n: 0 })).rejects.toBeInstanceOf(ToolError);
    await expect(tool.run(ctx, { n: "x" })).rejects.toMatchObject({ code: "invalid_input" });
  });
});
