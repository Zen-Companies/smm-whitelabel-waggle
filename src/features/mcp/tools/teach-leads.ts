import { z } from "zod";
import { KB_CONTENT_MAX, KB_TITLE_MAX, saveAnswer } from "@/features/knowledge-base";
import { LEAD_STAGES, loadBoardLeads, type LeadStage } from "@/features/leads";
import { writeAudit } from "@/lib/audit";
import { resolveBrand, ToolError, viaOf } from "../context";
import {
  brandId,
  clip,
  cursor,
  defineTool,
  LOCAL_ACTION,
  nextCursor,
  pageOf,
  READ,
  UNTRUSTED,
} from "./define";

// Teach Waggle (business info answers) and Leads, for AI assistants (17 Nov). Answers are what
// drafting may use, so they're written the way the owner said them; leads move on the same board
// as the app (New → Talking → Booked → Done).

const ANSWER_RULE =
  "Only write what the owner told you in this conversation or confirmed: never guess prices, hours, availability or promises. Show the owner the exact question and answer before saving.";

export const addAnswer = defineTool({
  name: "add_answer",
  title: "Add a business info answer",
  description: `Adds a question and answer to the brand's business info (Teach Waggle), which Waggle uses when it writes replies. Use it when a message got no good reply because Waggle didn't know something. ${ANSWER_RULE} If search_knowledge already has an answer to the question, use update_answer instead. Waggle can use the new answer within a few minutes.`,
  access: "act",
  ability: "brand.settings",
  annotations: { ...LOCAL_ACTION, idempotentHint: false },
  wraps: "knowledge-base.saveAnswer",
  input: z.object({
    brand_id: brandId,
    question: z
      .string()
      .trim()
      .min(3)
      .max(KB_TITLE_MAX)
      .describe('How customers ask it, e.g. "Do you deliver?"'),
    answer: z
      .string()
      .trim()
      .min(1)
      .max(KB_CONTENT_MAX)
      .describe("The owner's answer, in their words."),
  }),
  output: z.object({ entry_id: z.uuid(), title: z.string() }),
  async run(ctx, input) {
    const tenantId = await resolveBrand(ctx, input.brand_id);
    const r = await saveAnswer(ctx.db, {
      tenantId,
      actor: ctx.principal.userId,
      via: viaOf(ctx.principal),
      question: input.question,
      answer: input.answer,
    });
    if (!r.ok) {
      throw new ToolError(r.error === "save_failed" ? "unavailable" : "invalid_input", r.message);
    }
    return { entry_id: r.id, title: r.title };
  },
});

export const updateAnswer = defineTool({
  name: "update_answer",
  title: "Change a business info answer",
  description: `Changes an existing business info answer (entry_id from search_knowledge): its question, its answer or both. ${ANSWER_RULE}`,
  access: "act",
  ability: "brand.settings",
  annotations: LOCAL_ACTION,
  wraps: "knowledge-base.saveAnswer",
  input: z.object({
    brand_id: brandId,
    entry_id: z.uuid().describe("entry_id from search_knowledge."),
    question: z
      .string()
      .trim()
      .min(3)
      .max(KB_TITLE_MAX)
      .describe("The question, changed or as it was."),
    answer: z.string().trim().min(1).max(KB_CONTENT_MAX).describe("The full new answer."),
  }),
  output: z.object({ entry_id: z.uuid(), title: z.string() }),
  async run(ctx, input) {
    const tenantId = await resolveBrand(ctx, input.brand_id);
    const r = await saveAnswer(ctx.db, {
      tenantId,
      actor: ctx.principal.userId,
      via: viaOf(ctx.principal),
      id: input.entry_id,
      question: input.question,
      answer: input.answer,
    });
    if (!r.ok) {
      throw new ToolError(
        r.error === "not_found"
          ? "not_found"
          : r.error === "save_failed"
            ? "unavailable"
            : "invalid_input",
        r.message,
      );
    }
    return { entry_id: r.id, title: r.title };
  },
});

const STAGE_KEYS = LEAD_STAGES.map((s) => s.key) as [LeadStage, ...LeadStage[]];

export const listLeads = defineTool({
  name: "list_leads",
  title: "List leads",
  description: `The brand's leads (people who asked to buy, book or get a quote), newest first, with their stage on the board: ${LEAD_STAGES.map((s) => `${s.key} (${s.hint.toLowerCase()})`).join(", ")}. item_id opens the conversation with get_conversation. ${UNTRUSTED}`,
  access: "read",
  annotations: READ,
  wraps: "leads.loadBoardLeads",
  input: z.object({
    brand_id: brandId,
    stage: z.enum(["all", ...STAGE_KEYS]).default("all"),
    cursor,
  }),
  output: z.object({
    leads: z.array(
      z.object({
        lead_id: z.uuid(),
        item_id: z.uuid(),
        stage: z.enum(STAGE_KEYS),
        created_at: z.string(),
        source: z.string(),
        customer_name: z.string(),
        customer_contact: z.string().nullable(),
        customer_wants: z.string().nullable(),
        customer_text: z.string(),
      }),
    ),
    counts: z.record(z.string(), z.number()),
    next_cursor: nextCursor,
  }),
  async run(ctx, input) {
    const tenantId = await resolveBrand(ctx, input.brand_id);
    const all = await loadBoardLeads(ctx.db, tenantId);
    const counts = Object.fromEntries(
      LEAD_STAGES.map((s) => [s.key, all.filter((l) => l.stage === s.key).length]),
    );
    const shown = input.stage === "all" ? all : all.filter((l) => l.stage === input.stage);
    const { page, next_cursor } = pageOf(shown, input.cursor);
    return {
      leads: page.map((l) => ({
        lead_id: l.id,
        item_id: l.itemId,
        stage: l.stage,
        created_at: l.createdAt,
        source: l.source,
        customer_name: l.name,
        customer_contact: l.contact,
        customer_wants: l.wants,
        customer_text: clip(l.quote, 400),
      })),
      counts,
      next_cursor,
    };
  },
});

export const moveLead = defineTool({
  name: "move_lead",
  title: "Move a lead",
  description: `Moves a lead to another stage on the board (lead_id from list_leads): ${STAGE_KEYS.join(", ")}. Only when the owner said so, e.g. "they booked" or "that one's done".`,
  access: "act",
  ability: "replies.approve",
  annotations: LOCAL_ACTION,
  wraps: "leads table (same as the board's Move)",
  input: z.object({
    brand_id: brandId,
    lead_id: z.uuid(),
    stage: z.enum(STAGE_KEYS),
  }),
  output: z.object({ lead_id: z.uuid(), stage: z.enum(STAGE_KEYS) }),
  async run(ctx, input) {
    const tenantId = await resolveBrand(ctx, input.brand_id);
    const { data, error } = await ctx.db
      .from("leads")
      .update({ stage: input.stage, stage_changed_at: (ctx.now?.() ?? new Date()).toISOString() })
      .eq("id", input.lead_id)
      .eq("tenant_id", tenantId)
      .select("id");
    if (error) throw new ToolError("unavailable", "Couldn't move it. Try again.");
    if (!data?.length)
      throw new ToolError("not_found", "No lead with this lead_id for this brand.");
    await writeAudit(ctx.db, {
      tenantId,
      action: "lead_stage_changed",
      actor: ctx.principal.userId,
      details: { leadId: input.lead_id, stage: input.stage, via: viaOf(ctx.principal) },
    });
    return { lead_id: input.lead_id, stage: input.stage };
  },
});

export const TEACH_LEAD_TOOLS = [addAnswer, updateAnswer, listLeads, moveLead];
