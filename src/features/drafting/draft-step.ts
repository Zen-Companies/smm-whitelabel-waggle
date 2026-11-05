import { defaultReplyVia, loadPolicyInput, setCommentHidden, triage } from "@/features/approvals";
import type { Step, StatusEvent } from "@/features/inbox";
import { writeAudit } from "@/lib/audit";
import type { LlmClient } from "@/lib/llm/client";
import type { SocialProvider } from "@/lib/social/types";
import { loadTenantAiSpend } from "@/lib/llm/spend";
import { generateDraft } from "./generate";
import { loadThreadHistory } from "./history";
import { DRAFT_PROMPT_VERSION } from "./prompts";

const PRE_DRAFT_EVENTS: Record<"pause" | "ignore" | "escalate", StatusEvent> = {
  pause: "pause",
  ignore: "ignore",
  escalate: "escalate",
};

/**
 * The `classified` job step (docs/tdd.md §10): decide whether to draft at all (policy steps
 * 1-4), retrieve the top KB facts, draft with the LLM, check the draft against the facts, store
 * it (and the lead), move to `drafted`. Message and reply text never reach logs or audit rows.
 */
export function createDraftStep(deps: {
  llm: LlmClient;
  /** For auto-hiding spam comments (T40). */
  social?: () => SocialProvider;
  now?: () => Date;
}): Step {
  return async (item, ctx) => {
    const { db } = ctx;
    const now = deps.now?.() ?? new Date();

    // Spam, complaints, unclear, mode off, low confidence, unpaid or over this month's AI
    // allowance (T32): no draft. The cap is checked only for messages that would be drafted.
    const { input } = await loadPolicyInput(db, item.id, now);
    let pre = triage(input);
    if (pre.decision === "draft") {
      const spend = await loadTenantAiSpend(db, item.tenantId, now);
      pre = triage({ ...input, aiCapReached: spend.level === "reached" });
    }
    // T40: a spam comment with auto-hide on is hidden on the post, then ignored. If hiding
    // doesn't work, it comes to the owner to hide instead of staying public unnoticed.
    if (pre.decision === "hide") {
      const outcome = deps.social
        ? await setCommentHidden(
            { db, social: deps.social(), now: () => now },
            {
              tenantId: item.tenantId,
              itemId: item.id,
              actor: "system",
              hidden: true,
              signal: ctx.callSignal(),
            },
          )
        : null;
      if (outcome === "done" || outcome === "gone") {
        return {
          event: "ignore",
          details: {
            decision: "hide",
            policyReason: "spam",
            drafted: false,
            hiddenOnPlatform: outcome === "done",
          },
        };
      }
      return {
        event: "escalate",
        details: { decision: "escalate", policyReason: "spam", drafted: false, hideFailed: true },
      };
    }
    if (pre.decision !== "draft") {
      return {
        event: PRE_DRAFT_EVENTS[pre.decision],
        details: { decision: pre.decision, policyReason: pre.reason, drafted: false },
      };
    }

    // A retry after a crash between insert and transition reuses the draft (no second LLM bill).
    const { data: existing } = await db
      .from("drafts")
      .select("id")
      .eq("item_id", item.id)
      .eq("status", "pending")
      .limit(1)
      .maybeSingle();
    if (existing) return { event: "drafted", details: { draftId: existing.id, reused: true } };

    const { data: row, error } = await db
      .from("inbound_items")
      .select("text, kind, category, tenants!inner (name)")
      .eq("id", item.id)
      .single();
    if (error) throw new Error(`draft: item lookup failed: ${error.message}`);
    const { text, kind, category, tenants } = row as unknown as {
      text: string;
      kind: "comment" | "dm" | "review";
      category: string;
      tenants: { name: string };
    };

    // T41: a lead's comment is answered in DM, so the reply is written as a direct message.
    const replyVia = defaultReplyVia(kind, category);

    // T30: earlier messages of a DM thread, so a short follow-up keeps its meaning.
    const history = await loadThreadHistory(db, item.id);
    const { result, facts, model, issues, needsHuman, needsHumanReason } = await generateDraft(
      { db, llm: deps.llm },
      {
        tenantId: item.tenantId,
        itemId: item.id,
        businessName: tenants.name,
        kind: replyVia === "dm" ? "dm" : kind,
        category,
        text,
        history,
        signal: ctx.callSignal,
      },
    );

    const { data: draft, error: insertError } = await db
      .from("drafts")
      .insert({
        tenant_id: item.tenantId,
        item_id: item.id,
        body: result.reply,
        model,
        kb_entry_ids: facts.map((f) => f.id),
        needs_human: needsHuman,
        needs_human_reason: needsHumanReason,
        reply_via: replyVia,
      })
      .select("id")
      .single();
    if (insertError) throw new Error(`draft: insert failed: ${insertError.message}`);

    await writeAudit(db, {
      tenantId: item.tenantId,
      itemId: item.id,
      action: "draft_created",
      actor: "system",
      details: {
        draftId: draft.id,
        model,
        promptVersion: DRAFT_PROMPT_VERSION,
        kbEntryIds: facts.map((f) => f.id),
        // T31: scores of the topics used, to retune the relevance floor on real messages.
        kbSimilarities: facts.map((f) => Math.round(f.similarity * 1000) / 1000),
        historyMessages: history.length,
        replyVia,
        needsHuman,
        groundingIssues: issues,
      },
    });

    let leadId: string | null = null;
    if (category === "lead" && result.lead) {
      const { data: existingLead } = await db
        .from("leads")
        .select("id")
        .eq("item_id", item.id)
        .maybeSingle();
      if (!existingLead) {
        const { data: lead, error: leadError } = await db
          .from("leads")
          .insert({
            tenant_id: item.tenantId,
            item_id: item.id,
            name: result.lead.name ?? null,
            contact: result.lead.contact ?? null,
            request: result.lead.request ?? null,
          })
          .select("id")
          .single();
        if (leadError) throw new Error(`draft: lead insert failed: ${leadError.message}`);
        leadId = lead.id;
        // The owner email is T13.
        await writeAudit(db, {
          tenantId: item.tenantId,
          itemId: item.id,
          action: "lead_captured",
          actor: "system",
          details: { leadId },
        });
      }
    }

    return {
      event: "drafted",
      details: {
        draftId: draft.id,
        needsHuman,
        kbMatches: facts.length,
        leadId,
        groundingIssues: issues,
      },
    };
  };
}
