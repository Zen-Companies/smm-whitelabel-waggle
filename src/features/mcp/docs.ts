import { z } from "zod";
import { kindOf, type CallKind } from "./limits";
import type { McpTool } from "./tools/define";

// The staff "MCP tools" docs (docs/mcp/PLAN.md §7, Phase 4), generated from the tool registry so
// they always match what's live. Pure: the page and the OpenAPI route render what this returns.

type JsonSchema = {
  type?: string | string[];
  format?: string;
  enum?: unknown[];
  const?: unknown;
  anyOf?: JsonSchema[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  description?: string;
  default?: unknown;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  maxItems?: number;
};

export interface FieldDoc {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

const schemaOf = (s: z.ZodType, io: "input" | "output") =>
  z.toJSONSchema(s, { io, unrepresentable: "any" }) as JsonSchema;

/** A short, readable type: "uuid", "string ≤ 1,000", "public | dm", "uuid[] (1–10)". */
export function typeLabel(s: JsonSchema): string {
  if (s.const !== undefined) return JSON.stringify(s.const);
  if (s.enum) return s.enum.map(String).join(" | ");
  if (s.anyOf) {
    const parts = s.anyOf.filter((p) => p.type !== "null").map(typeLabel);
    const nullable = s.anyOf.some((p) => p.type === "null");
    return parts.join(" | ") + (nullable ? " | null" : "");
  }
  const types = Array.isArray(s.type) ? s.type : [s.type ?? "any"];
  const nullable = types.includes("null");
  const t = types.find((x) => x !== "null") ?? "null";
  let label: string;
  if (t === "string") {
    label = s.format === "uuid" ? "uuid" : s.format === "date-time" ? "date-time" : "string";
    if (s.maxLength !== undefined) label += ` ≤ ${s.maxLength.toLocaleString("en-US")}`;
  } else if (t === "array") {
    label = `${s.items ? typeLabel(s.items) : "any"}[]`;
    if (s.maxItems !== undefined) label += ` (≤ ${s.maxItems})`;
  } else if (t === "integer" || t === "number") {
    label = t;
    if (s.minimum !== undefined && s.maximum !== undefined) label += ` ${s.minimum}–${s.maximum}`;
  } else {
    label = t;
  }
  return nullable ? `${label} | null` : label;
}

/** One row per top-level field of an object schema. */
export function fieldsOf(s: JsonSchema): FieldDoc[] {
  const required = new Set(s.required ?? []);
  return Object.entries(s.properties ?? {}).map(([name, f]) => ({
    name,
    type: typeLabel(f),
    required: required.has(name),
    description:
      (f.description ?? "") + (f.default !== undefined ? ` Default: ${String(f.default)}.` : ""),
  }));
}

/** The error codes a tool of this kind can answer with (beyond `internal`). */
export function errorsFor(kind: CallKind): string[] {
  const common = ["invalid_input", "brand_required", "brand_not_allowed", "rate_limited"];
  if (kind === "read") return [...common, "not_found", "unavailable"];
  const act = [...common, "not_found", "already_decided", "provider_failed", "unavailable"];
  return kind === "send" ? [...act, "daily_limit"] : act;
}

export interface ToolDoc {
  name: string;
  title: string;
  description: string;
  access: McpTool["access"];
  kind: CallKind;
  wraps: string;
  /** Plain-language chips from the annotations. */
  traits: { label: string; tone: "honey" | "red" | "grey" | "green" }[];
  input: FieldDoc[];
  output: FieldDoc[];
  errors: string[];
}

export function toolDoc(tool: McpTool): ToolDoc {
  const a = tool.annotations;
  const traits: ToolDoc["traits"] = [];
  if (a.readOnlyHint) traits.push({ label: "Read only", tone: "green" });
  else traits.push({ label: "Asks the user first", tone: "honey" });
  if (a.destructiveHint) traits.push({ label: "Destructive", tone: "red" });
  if (a.openWorldHint) traits.push({ label: "Reaches Instagram/Facebook", tone: "grey" });
  const kind = kindOf(tool);
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    access: tool.access,
    kind,
    wraps: tool.wraps,
    traits,
    input: fieldsOf(schemaOf(tool.input, "input")),
    output: fieldsOf(schemaOf(tool.output, "output")),
    errors: errorsFor(kind),
  };
}

/** A starting input for "Try it": required fields as placeholders, brand_id filled by the page. */
export function sampleInput(doc: ToolDoc): string {
  const out: Record<string, unknown> = {};
  for (const f of doc.input) {
    if (!f.required || f.name === "brand_id") continue;
    out[f.name] = f.type.startsWith("uuid[]")
      ? ["…"]
      : f.type.includes("[]")
        ? []
        : f.type.startsWith("integer") || f.type.startsWith("number")
          ? 0
          : "";
  }
  return JSON.stringify(out, null, 2);
}

/**
 * The registry as OpenAPI 3.1, for tooling and reviewers. MCP tools aren't REST endpoints: each
 * is listed as POST /tools/{name}, with the input as the body and the result as the response.
 */
export function buildOpenApi(tools: readonly McpTool[], serverUrl: string) {
  const paths: Record<string, unknown> = {};
  for (const tool of tools) {
    const doc = toolDoc(tool);
    paths[`/tools/${tool.name}`] = {
      post: {
        operationId: tool.name,
        summary: tool.title,
        description: tool.description,
        tags: [tool.access === "read" ? "Read" : "Act"],
        "x-mcp-annotations": tool.annotations,
        "x-waggle-wraps": tool.wraps,
        requestBody: {
          required: true,
          content: { "application/json": { schema: stripMeta(schemaOf(tool.input, "input")) } },
        },
        responses: {
          "200": {
            description: "The tool's structured result.",
            content: {
              "application/json": { schema: stripMeta(schemaOf(tool.output, "output")) },
            },
          },
          default: {
            description: `An error result: { error, message }. Codes: ${doc.errors.join(", ")}, internal.`,
          },
        },
      },
    };
  }
  return {
    openapi: "3.1.0",
    info: {
      title: "Waggle MCP tools",
      version: "1.0.0",
      description:
        "The tools Waggle's MCP server (/api/mcp) offers AI assistants, generated from the registry. " +
        "They are called over MCP (tools/call), not as REST endpoints.",
    },
    servers: [{ url: `${serverUrl}/api/mcp` }],
    paths,
  };
}

function stripMeta(s: JsonSchema & { $schema?: string }): JsonSchema {
  const rest = { ...s };
  delete rest.$schema;
  return rest;
}
