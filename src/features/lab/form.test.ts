import { describe, expect, it } from "vitest";
import type { PreviewResult } from "./engine";
import { differences, outcomeOf, outcomeText } from "./compare";
import { parseCaseForm, parseRunForm, parseVariant } from "./form";
import { currentVariant } from "./variants";

const TENANT = "10000000-0000-4000-8000-000000000001";

function form(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

function sideFields(side: "a" | "b", extra: Record<string, string> = {}) {
  const v = currentVariant();
  return {
    [`${side}_classifier`]: v.classifier,
    [`${side}_questionsVersion`]: v.questionsVersion,
    [`${side}_classifyPromptVersion`]: v.classifyPromptVersion,
    [`${side}_draftPromptVersion`]: v.draftPromptVersion,
    [`${side}_contextMode`]: "name",
    ...Object.fromEntries(Object.entries(extra).map(([k, val]) => [`${side}_${k}`, val])),
  };
}

describe("parseRunForm", () => {
  it("reads both setups", () => {
    const parsed = parseRunForm(
      form({
        tenantId: TENANT,
        kind: "dm",
        text: "  How much is the preset pack?  ",
        ...sideFields("a"),
        ...sideFields("b", { contextMode: "custom", contextText: "Sells Lightroom presets." }),
      }),
    );
    expect(parsed).toEqual({
      request: {
        tenantId: TENANT,
        kind: "dm",
        text: "How much is the preset pack?",
        draft: false,
        a: currentVariant(),
        b: { ...currentVariant(), context: { mode: "custom", text: "Sells Lightroom presets." } },
      },
    });
  });

  it("says what is missing", () => {
    expect(
      parseRunForm(
        form({ tenantId: TENANT, kind: "dm", text: " ", ...sideFields("a"), ...sideFields("b") }),
      ),
    ).toEqual({
      error: "Type a message.",
    });
    expect(
      parseRunForm(
        form({
          tenantId: TENANT,
          kind: "comment",
          text: "Hi",
          draft: "on",
          ...sideFields("a"),
          ...sideFields("b", { contextMode: "custom", contextText: "" }),
        }),
      ),
    ).toEqual({ error: "Setup B: check the business description." });
  });

  it("an unknown version is refused", () => {
    expect(parseVariant(form(sideFields("a", { questionsVersion: "v9" })), "a")).toEqual({
      error: "Setup A: check the questionsVersion.",
    });
  });
});

describe("parseCaseForm", () => {
  it("needs a set name and a category", () => {
    const base = { tenantId: TENANT, kind: "comment", text: "Link pls" };
    expect(
      parseCaseForm(form({ ...base, setName: "Digital products", expectedCategory: "lead" })),
    ).toEqual({
      input: { ...base, setName: "Digital products", expectedCategory: "lead" },
    });
    expect(parseCaseForm(form({ ...base, setName: " ", expectedCategory: "lead" }))).toEqual({
      error: "Name the set.",
    });
    expect(parseCaseForm(form({ ...base, setName: "x", expectedCategory: "nope" }))).toEqual({
      error: "Pick the right category.",
    });
  });
});

const run = (over: Partial<PreviewResult>): PreviewResult => ({
  classification: { category: "faq", confidence: 0.9, provider: "jev", model: "m" },
  triage: { decision: "draft" },
  facts: null,
  draft: null,
  groundingIssues: [],
  policy: null,
  reachedStep: "triage",
  error: null,
  timings: { classifyMs: 10, draftMs: null },
  ...over,
});

describe("outcomes and differences", () => {
  it("names where a run ended", () => {
    expect(outcomeText(outcomeOf(run({})))).toBe("Would draft a reply");
    expect(
      outcomeText(outcomeOf(run({ triage: { decision: "escalate", reason: "complaint" } }))),
    ).toBe("Escalate to the owner (complaint)");
    expect(
      outcomeText(outcomeOf(run({ policy: { decision: "approve", reason: "approval_required" } }))),
    ).toBe("Ask the owner first (approval required)");
    expect(outcomeText(outcomeOf(run({ error: { step: "classify", message: "x" } })))).toBe(
      "Failed at classify",
    );
  });

  it("flags the fields that differ, not confidence alone", () => {
    const a = run({});
    expect(
      differences(a, run({ classification: { ...a.classification!, confidence: 0.6 } })).size,
    ).toBe(0);
    const b = run({
      classification: { category: "complaint", confidence: 0.8, provider: "llm", model: "m" },
      triage: { decision: "escalate", reason: "complaint" },
    });
    expect([...differences(a, b)].sort()).toEqual(["category", "outcome"]);
  });
});
