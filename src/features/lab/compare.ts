import type { PreviewResult } from "./engine";

// What a run ended in, and where two runs differ (pure, unit-tested; shown in the Lab).

export type Outcome =
  | { kind: "error"; step: string; message: string }
  | { kind: "decision"; decision: string; reason?: string; final: boolean };

/** The furthest decision a run reached: policy() if it drafted, else triage. */
export function outcomeOf(result: PreviewResult): Outcome {
  if (result.error)
    return { kind: "error", step: result.error.step, message: result.error.message };
  if (result.policy) {
    return {
      kind: "decision",
      decision: result.policy.decision,
      reason: result.policy.reason,
      final: true,
    };
  }
  if (result.triage) {
    return {
      kind: "decision",
      decision: result.triage.decision,
      reason: "reason" in result.triage ? result.triage.reason : undefined,
      // "draft" is where a classification-only run stops, not an outcome.
      final: result.triage.decision !== "draft",
    };
  }
  return { kind: "error", step: "classify", message: "No result." };
}

export function outcomeText(outcome: Outcome): string {
  if (outcome.kind === "error") return `Failed at ${outcome.step}`;
  const reason = outcome.reason ? ` (${outcome.reason.replaceAll("_", " ")})` : "";
  switch (outcome.decision) {
    case "send":
      return `Send${reason}`;
    case "approve":
      return `Ask the owner first${reason}`;
    case "escalate":
      return `Escalate to the owner${reason}`;
    case "ignore":
      return `Ignore${reason}`;
    case "hide":
      return `Hide on the post${reason}`;
    case "pause":
      return `Pause${reason}`;
    case "draft":
      return "Would draft a reply";
    default:
      return outcome.decision;
  }
}

export type CompareField = "category" | "outcome" | "facts" | "reply";

/** The fields where A and B disagree, for highlighting. Confidence alone doesn't count. */
export function differences(a: PreviewResult, b: PreviewResult): Set<CompareField> {
  const out = new Set<CompareField>();
  if (a.classification?.category !== b.classification?.category) out.add("category");
  if (outcomeText(outcomeOf(a)) !== outcomeText(outcomeOf(b))) out.add("outcome");
  const titles = (r: PreviewResult) => (r.facts ?? []).map((f) => f.id).join(",");
  if (titles(a) !== titles(b)) out.add("facts");
  if ((a.draft?.reply ?? "") !== (b.draft?.reply ?? "")) out.add("reply");
  return out;
}
