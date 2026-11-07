import { describe, expect, it } from "vitest";
import { buildOpenApi, errorsFor, sampleInput, toolDoc, typeLabel } from "./docs";
import { TOOLS, toolByName } from "./tools/registry";

describe("typeLabel", () => {
  it("names the common shapes plainly", () => {
    expect(typeLabel({ type: "string", format: "uuid" })).toBe("uuid");
    expect(typeLabel({ type: "string", maxLength: 1000 })).toBe("string ≤ 1,000");
    expect(typeLabel({ type: "string", enum: ["public", "dm"] })).toBe("public | dm");
    expect(typeLabel({ type: ["string", "null"] })).toBe("string | null");
    expect(
      typeLabel({ type: "array", items: { type: "string", format: "uuid" }, maxItems: 10 }),
    ).toBe("uuid[] (≤ 10)");
    expect(
      typeLabel({
        anyOf: [
          { type: "string", const: "now" },
          { type: "string", format: "date-time" },
        ],
      }),
    ).toBe('"now" | date-time');
  });
});

describe("toolDoc", () => {
  it("approve_reply: traits from the annotations, fields from the schema", () => {
    const doc = toolDoc(toolByName("approve_reply")!);
    expect(doc.traits.map((t) => t.label)).toEqual([
      "Asks the user first",
      "Destructive",
      "Reaches Instagram/Facebook",
    ]);
    expect(doc.kind).toBe("send");
    const edited = doc.input.find((f) => f.name === "edited_body")!;
    expect(edited).toMatchObject({ type: "string ≤ 1,000", required: false });
    expect(doc.input.find((f) => f.name === "item_id")).toMatchObject({
      type: "uuid",
      required: true,
    });
    expect(doc.output.map((f) => f.name)).toContain("undo_until");
    expect(doc.errors).toContain("daily_limit");
  });

  it("a read tool is marked read only and never answers daily_limit", () => {
    const doc = toolDoc(toolByName("list_inbox")!);
    expect(doc.traits.map((t) => t.label)).toEqual(["Read only"]);
    expect(doc.errors).not.toContain("daily_limit");
    expect(doc.input.find((f) => f.name === "tab")?.description).toContain("Default: for_you.");
  });

  it("every registry tool documents (no schema the docs can't show)", () => {
    for (const t of TOOLS) {
      const doc = toolDoc(t);
      expect(doc.output.length, t.name).toBeGreaterThan(0);
      for (const f of [...doc.input, ...doc.output])
        expect(f.type, `${t.name}.${f.name}`).not.toBe("any");
    }
  });
});

it("errorsFor: sends add daily_limit to the action errors", () => {
  expect(errorsFor("send")).toEqual([...errorsFor("act"), "daily_limit"]);
});

it("sampleInput: required fields only, brand_id left to the page", () => {
  const sample = JSON.parse(sampleInput(toolDoc(toolByName("approve_reply")!)));
  expect(sample).toEqual({ item_id: "", draft_id: "" });
  expect(JSON.parse(sampleInput(toolDoc(toolByName("list_brands")!)))).toEqual({});
});

it("buildOpenApi: one POST per tool, input as the body, no $schema noise", () => {
  const spec = buildOpenApi(TOOLS, "https://waggle.example");
  expect(spec.openapi).toBe("3.1.0");
  expect(spec.servers).toEqual([{ url: "https://waggle.example/api/mcp" }]);
  expect(Object.keys(spec.paths)).toHaveLength(TOOLS.length);
  const op = (spec.paths["/tools/create_post"] as { post: Record<string, unknown> }).post;
  expect(op.operationId).toBe("create_post");
  expect(JSON.stringify(op)).not.toContain("$schema");
  expect(JSON.stringify(op)).toContain("account_ids");
});
