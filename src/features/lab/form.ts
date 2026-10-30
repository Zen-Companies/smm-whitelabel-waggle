import { z } from "zod";
import { CATEGORIES } from "@/lib/classifier/types";
import { variantSchema, type Variant } from "./variants";

// Lab form parsing (pure, unit-tested). Field names: tenantId, kind, text, draft, and for each
// side a_/b_ + classifier, questionsVersion, classifyPromptVersion, draftPromptVersion,
// contextMode, contextText, classifyModel, draftModel.

export const LAB_TEXT_MAX = 2000;

const runFormSchema = z.object({
  tenantId: z.uuid(),
  kind: z.enum(["comment", "dm"]),
  text: z.string().trim().min(1, "Type a message.").max(LAB_TEXT_MAX),
  draft: z.boolean(),
});

const str = (form: FormData, key: string) => {
  const value = form.get(key);
  return typeof value === "string" ? value : undefined;
};

export function parseVariant(
  form: FormData,
  side: "a" | "b",
): { variant: Variant } | { error: string } {
  const f = (key: string) => str(form, `${side}_${key}`);
  const mode = f("contextMode") === "custom" ? "custom" : "name";
  const parsed = variantSchema.safeParse({
    classifier: f("classifier"),
    questionsVersion: f("questionsVersion"),
    classifyPromptVersion: f("classifyPromptVersion"),
    draftPromptVersion: f("draftPromptVersion"),
    context: mode === "custom" ? { mode, text: f("contextText") ?? "" } : { mode },
    classifyModel: f("classifyModel") || undefined,
    draftModel: f("draftModel") || undefined,
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue.path[0] === "context" ? "business description" : String(issue.path[0]);
    return { error: `Setup ${side.toUpperCase()}: check the ${where}.` };
  }
  return { variant: parsed.data };
}

export interface LabRunRequest {
  tenantId: string;
  kind: "comment" | "dm";
  text: string;
  /** Also retrieve, draft and run policy(); otherwise classification and triage only. */
  draft: boolean;
  a: Variant;
  b: Variant;
}

export function parseRunForm(form: FormData): { request: LabRunRequest } | { error: string } {
  const base = runFormSchema.safeParse({
    tenantId: str(form, "tenantId"),
    kind: str(form, "kind"),
    text: str(form, "text") ?? "",
    draft: str(form, "draft") === "on",
  });
  if (!base.success) {
    const issue = base.error.issues[0];
    return { error: issue.path[0] === "text" ? issue.message : "Pick a business and a kind." };
  }
  const a = parseVariant(form, "a");
  if ("error" in a) return a;
  const b = parseVariant(form, "b");
  if ("error" in b) return b;
  return { request: { ...base.data, a: a.variant, b: b.variant } };
}

const caseSchema = z.object({
  tenantId: z.uuid(),
  setName: z.string().trim().min(1, "Name the set.").max(60),
  kind: z.enum(["comment", "dm"]),
  text: z.string().trim().min(1).max(LAB_TEXT_MAX),
  expectedCategory: z.enum(CATEGORIES),
});

export type LabCaseInput = z.infer<typeof caseSchema>;

export function parseCaseForm(form: FormData): { input: LabCaseInput } | { error: string } {
  const parsed = caseSchema.safeParse({
    tenantId: str(form, "tenantId"),
    setName: str(form, "setName") ?? "",
    kind: str(form, "kind"),
    text: str(form, "text") ?? "",
    expectedCategory: str(form, "expectedCategory"),
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      error: issue.path[0] === "setName" ? issue.message : "Pick the right category.",
    };
  }
  return { input: parsed.data };
}
