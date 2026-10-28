import type { Step } from "@/features/inbox";
import { writeAudit } from "@/lib/audit";
import type { Classifier } from "@/lib/classifier/types";
import type { Json } from "@/lib/supabase/database.types";

// The `new` job step (docs/tasks.md T7): classify, store the result on the item, move to
// `classified`. Message text goes to the classifier only; logs and audit rows carry ids/scores.

export function createClassifyStep(deps: { classifier: Classifier }): Step {
  return async (item, ctx) => {
    const { data: row, error } = await ctx.db
      .from("inbound_items")
      .select("text, kind, tenants!inner (name)")
      .eq("id", item.id)
      .single();
    if (error) throw new Error(`classify: item lookup failed: ${error.message}`);
    const { text, kind, tenants } = row as unknown as {
      text: string;
      kind: "comment" | "dm";
      tenants: { name: string };
    };

    // ctx.callSignal() caps the LLM fallback at 20 s; FallbackClassifier gives Jev its own 3 s.
    const result = await deps.classifier.classify(
      { tenantId: item.tenantId, itemId: item.id, text, kind, businessContext: tenants.name },
      { signal: ctx.callSignal() },
    );

    const confidence = Math.round(result.confidence * 10_000) / 10_000;
    const { error: updateError } = await ctx.db
      .from("inbound_items")
      .update({
        category: result.category,
        confidence,
        classifier_used: result.provider,
        classifier_scores: (result.scores ?? null) as Json,
      })
      .eq("id", item.id);
    if (updateError) throw new Error(`classify: storing result failed: ${updateError.message}`);

    if (result.fallbackReason) {
      await writeAudit(ctx.db, {
        tenantId: item.tenantId,
        itemId: item.id,
        action: "classifier_fallback",
        actor: "system",
        details: { reason: result.fallbackReason, used: result.provider, model: result.model },
      });
    }

    return {
      event: "classified",
      details: {
        category: result.category,
        confidence,
        classifierUsed: result.provider,
        model: result.model,
        unclearReason: result.reason,
        fallbackReason: result.fallbackReason,
        scores: (result.scores ?? undefined) as Json | undefined,
      },
    };
  };
}
