"use server";

import * as Sentry from "@sentry/nextjs";
import { NoObjectGeneratedError } from "ai";
import { redirect } from "next/navigation";
import { z } from "zod";
import { redraftAfterAnswerChange } from "@/features/catch-up";
import { embedEntry } from "@/features/knowledge-base";
import { getTenantFor, NOT_ALLOWED } from "@/features/tenants";
import { writeAudit } from "@/lib/audit";
import { BUSINESS_PROFILE_MAX } from "@/lib/classifier/business-context";
import { markFactChecked } from "@/lib/facts";
import { getLlmClientOrNull } from "@/lib/llm";
import { asMessageData } from "@/lib/llm/prompt-data";
import type { Json } from "@/lib/supabase/database.types";
import { getServiceClient } from "@/lib/supabase/service";
import { ASK_FIRST_LABELS, askFirstFloor, withAskFirstFloor } from "@/lib/ask-first";
import { chatSavedOf, kindAnswer, MISSING_FIELDS, type ChatSaved } from "./chat";
import { chatLogSchema, kindChangedLine } from "./chat-log";
import {
  FACT_FIELDS,
  FIELD_TITLE,
  answerTurn,
  editorTurn,
  fieldValue,
  hoursTurn,
  knownFacts,
  looksSecret,
  savedLine,
  TYPED_MAX,
  typedOutputSchema,
  typedSystemPrompt,
  typedTurn,
  typedUserPrompt,
  type FactField,
  type TypedTurn,
} from "./chat-fields";
import { formatHours, openDaysSchema, weekOf } from "./chat-hours";
import { typingAllowed } from "./chat-limit";
import { BUSINESS_KINDS, CUSTOM_KIND_MAX, kindFromProfile, profileText } from "./starter";

// Step 3 is a conversation with Waggle (board approved 23 Nov). Every action checks the role
// first, writes with the service role after it, and audits what the owner did (rule 11). Ids and
// choices only in audit rows and logs: never what the owner or a customer typed (rule 10).

const KIND_KEYS = BUSINESS_KINDS.map((k) => k.key) as [string, ...string[]];

/** The owner's bubble, kept as first answered. */
const label = z.string().trim().max(1000).optional();

const answerSchema = z.discriminatedUnion("step", [
  z.object({
    step: z.literal("kind"),
    kind: z.enum(KIND_KEYS),
    words: z.string().trim().max(CUSTOM_KIND_MAX).optional(),
    label,
  }),
  z.object({
    step: z.literal("facts"),
    checked: z.array(z.uuid()).max(20),
    toAsk: z.array(z.enum(MISSING_FIELDS)).max(MISSING_FIELDS.length),
    label,
  }),
  z.object({
    step: z.literal("missing"),
    field: z.enum(MISSING_FIELDS),
    outcome: z.enum(["saved", "skipped"]),
  }),
  z.object({
    step: z.literal("replies"),
    replies: z.enum(["sent", "skipped", "none"]),
    sent: z.number().int().min(0).max(1000),
    label,
  }),
  z.object({ step: z.literal("needyou") }),
  z.object({ step: z.literal("topics"), topics: z.array(z.string().max(80)).max(40), label }),
  z.object({ step: z.literal("mode"), mode: z.enum(["approve", "auto"]), label }),
]);
export type ChatAnswer = z.input<typeof answerSchema>;

async function loadSaved(tenantId: string): Promise<ChatSaved> {
  const { data } = await getServiceClient()
    .from("tenants")
    .select("setup_chat")
    .eq("id", tenantId)
    .single();
  return chatSavedOf(data?.setup_chat);
}

async function writeSaved(tenantId: string, saved: ChatSaved): Promise<boolean> {
  const { error } = await getServiceClient()
    .from("tenants")
    .update({ setup_chat: saved as Json, setup_screen: "chat" })
    .eq("id", tenantId);
  return !error;
}

/** Pure: the first answer's bubble kept (a later change shows at the bottom of the thread). */
function keepLabel(saved: ChatSaved, a: z.infer<typeof answerSchema>): ChatSaved["labels"] {
  if (a.step === "missing" || a.step === "needyou" || !a.label) return saved.labels;
  if (saved.labels?.[a.step]) return saved.labels;
  return { ...saved.labels, [a.step]: a.label };
}

/**
 * An answer tapped in the thread, saved at once (a reload brings the thread back). A changed kind
 * returns Waggle's line about it (with the check-first topics the new kind adds).
 */
export async function saveChatAnswer(
  input: ChatAnswer,
): Promise<{ error?: string; line?: string }> {
  const parsed = answerSchema.safeParse(input);
  if (!parsed.success) return { error: "Something went wrong. Please reload." };
  const tenant = await getTenantFor("brand.settings");
  if (!tenant) return { error: NOT_ALLOWED };
  const db = getServiceClient();
  const a = parsed.data;
  const saved = await loadSaved(tenant.id);
  let next: ChatSaved = saved;
  let details: Record<string, Json> = { step: a.step };
  let line: string | undefined;

  if (a.step === "kind") {
    const words = a.kind === "other" ? (a.words ?? "") : "";
    next = { ...saved, kind: a.kind, kindWords: words };
    // The kind leads the business description Waggle sorts messages with (as setup always did).
    const { data: t } = await db
      .from("tenants")
      .select("business_profile, setup_done_at, ask_first_topics")
      .eq("id", tenant.id)
      .single();
    const before = t?.business_profile ?? "";
    const was = kindFromProfile(before)?.key ?? null;
    const rest = was ? before.split("\n").slice(1).join("\n") : before;
    // A kind changed after setup finished: its safety floor joins what's checked first now
    // (added, never removed; before finishing, finishSetup adds it).
    const topicsNow = t?.ask_first_topics ?? [];
    const withFloor = t?.setup_done_at ? withAskFirstFloor(topicsNow, a.kind) : topicsNow;
    const { error } = await db
      .from("tenants")
      .update({
        business_profile: profileText(a.kind, rest, BUSINESS_PROFILE_MAX, words),
        ...(withFloor.length !== topicsNow.length ? { ask_first_topics: withFloor } : {}),
      })
      .eq("id", tenant.id);
    if (error) return { error: "Couldn’t save. Try again." };
    details = { ...details, kind: a.kind, ...(was ? { was } : {}) };
    if (was && was !== a.kind) {
      const oldFloor = askFirstFloor(was);
      const added = askFirstFloor(a.kind).filter((id) => !oldFloor.includes(id));
      line = kindChangedLine(
        kindAnswer(a.kind, words),
        added.map((id) => ASK_FIRST_LABELS[id]),
      );
    }
  } else if (a.step === "facts") {
    // "Looks good": the facts shown are checked by the owner.
    for (const id of a.checked) {
      await markFactChecked(db, {
        tenantId: tenant.id,
        kbEntryId: id,
        userId: tenant.userId,
        via: "check_button",
      });
    }
    // What's missing now is asked next (kept from the first "Looks good").
    next = { ...saved, facts: "ok", toAsk: saved.toAsk ?? a.toAsk };
    details = { ...details, checked: a.checked.length, toAsk: a.toAsk.length };
  } else if (a.step === "missing") {
    next = { ...saved, missing: { ...saved.missing, [a.field]: a.outcome } };
    details = { ...details, field: a.field, outcome: a.outcome };
  } else if (a.step === "replies") {
    next = { ...saved, replies: a.replies, sent: a.sent };
    details = { ...details, replies: a.replies, sent: a.sent };
  } else if (a.step === "needyou") {
    next = { ...saved, needyou: "done" };
  } else if (a.step === "topics") {
    // Saved to the thread; finishing setup writes them (with the safety floor) for policy().
    next = { ...saved, topics: a.topics };
    details = { ...details, topics: a.topics.length };
  } else {
    next = { ...saved, mode: a.mode };
    details = { ...details, mode: a.mode };
  }
  const labels = keepLabel(saved, a);
  if (labels) next = { ...next, labels };
  if (!(await writeSaved(tenant.id, next))) return { error: "Couldn’t save. Try again." };
  await writeAudit(db, {
    tenantId: tenant.id,
    action: "setup_chat_answered",
    actor: tenant.userId,
    details,
  });
  return line ? { line } : {};
}

/** Step 2's "Skip for now": step 3's chat opens with its replies question answered "not now". */
export async function skipIntoChat(): Promise<void> {
  const tenant = await getTenantFor("brand.settings");
  if (tenant) {
    const saved = await loadSaved(tenant.id);
    if (await writeSaved(tenant.id, { ...saved, replies: "skipped", sent: 0 })) {
      await writeAudit(getServiceClient(), {
        tenantId: tenant.id,
        action: "setup_chat_answered",
        actor: tenant.userId,
        details: { step: "replies", replies: "skipped", from: "step2" },
      });
    }
  }
  redirect("/setup?screen=chat");
}

/**
 * The thread's history (what was typed and said, fixes, changes to earlier answers, feedback,
 * waiting customers' outcomes), saved as it grows so leaving and coming back restores it.
 * Tenant-scoped, kept until setup is finished + 30 days (chat-log.ts). Not audited per write: the
 * answers, typed messages and saves it records are audited by their own actions.
 */
export async function saveChatLog(input: unknown): Promise<{ error?: string }> {
  const parsed = chatLogSchema.safeParse(input);
  if (!parsed.success) return { error: "Couldn’t save the chat." };
  const tenant = await getTenantFor("brand.settings");
  if (!tenant) return { error: NOT_ALLOWED };
  const { error } = await getServiceClient()
    .from("tenants")
    .update({ setup_chat_log: parsed.data as Json })
    .eq("id", tenant.id);
  if (error) {
    Sentry.captureException(error, { extra: { tenantId: tenant.id, step: "setup_chat_log" } });
    return { error: "Couldn’t save the chat." };
  }
  return {};
}

const typedSchema = z.object({
  text: z.string().trim().min(1).max(TYPED_MAX),
  target: z.object({ field: z.enum(FACT_FIELDS), id: z.uuid().nullable() }).nullable(),
});

/**
 * The typing box: secrets stop here (no AI call); then, within the rate limit and the AI cap,
 * the AI picks one action (zod-checked), which code turns into one of our turns.
 */
export async function typeToWaggle(input: {
  text: string;
  target: { field: string; id: string | null } | null;
}): Promise<TypedTurn> {
  const parsed = typedSchema.safeParse(input);
  if (!parsed.success) return { kind: "ask_which", field: null };
  const tenant = await getTenantFor("brand.settings");
  if (!tenant) return { kind: "error" };
  const db = getServiceClient();
  const audit = (outcome: string) =>
    writeAudit(db, {
      tenantId: tenant.id,
      action: "setup_chat_typed",
      actor: tenant.userId,
      details: { outcome, length: parsed.data.text.length },
    });
  if (looksSecret(parsed.data.text)) {
    await audit("secret");
    return { kind: "secret" };
  }
  const llm = getLlmClientOrNull();
  if (!llm || !(await typingAllowed(db, tenant.id))) {
    await audit("limited");
    return { kind: "limited" };
  }
  const { data: kb } = await db
    .from("kb_entries")
    .select("id, title, content, found_kind, found_source, needs_check")
    .eq("tenant_id", tenant.id)
    .order("created_at", { ascending: true })
    .limit(200);
  const facts = knownFacts(kb ?? []);
  let turn: TypedTurn;
  try {
    const result = await llm.generateObject({
      tenantId: tenant.id,
      purpose: "classify",
      schema: typedOutputSchema,
      system: typedSystemPrompt(),
      prompt: typedUserPrompt({
        text: parsed.data.text,
        facts,
        target: parsed.data.target,
        escape: asMessageData,
      }),
    });
    turn = typedTurn(result.object, facts);
  } catch (err) {
    // Ids only: the model's text (which can echo the owner's) never reaches Sentry (rule 10).
    const unreadable = NoObjectGeneratedError.isInstance(err);
    Sentry.captureException(unreadable ? new Error("setup_chat_typed: unreadable output") : err, {
      extra: { tenantId: tenant.id, step: "setup_chat_typed" },
    });
    // An answer that isn't valid data is never shown: the field's editor or "which one?".
    const field = parsed.data.target?.field ?? null;
    turn = !unreadable
      ? { kind: "error" }
      : field === "hours"
        ? hoursTurn(null, facts)
        : field === "address" || field === "contact"
          ? editorTurn(field, null, facts)
          : field === "answer"
            ? answerTurn(parsed.data.target?.id ?? null, null, facts)
            : { kind: "ask_which", field };
  }
  await audit(turn.kind);
  return turn;
}

const factSchema = z.object({
  field: z.enum(FACT_FIELDS),
  value: z.string().max(2000),
  entryId: z.uuid().nullable(),
});

/**
 * Save on a proposed change: the value is checked again here, saved as business info (checked:
 * the owner wrote it), and only the unsent drafts that used it are written again.
 */
export async function saveChatFact(input: {
  field: string;
  value: string;
  entryId: string | null;
}): Promise<{ error?: string; line?: string }> {
  const parsed = factSchema.safeParse(input);
  if (!parsed.success) return { error: "Something went wrong. Please reload." };
  const { field, entryId } = parsed.data;
  const value = fieldValue(field, parsed.data.value);
  if (!value) return { error: "That doesn’t look right. Try again." };
  return storeFact(field, value, entryId);
}

const hoursSchema = z.object({
  days: openDaysSchema.refine((d) => d.length > 0, "no open day"),
  entryId: z.uuid().nullable(),
});

/**
 * "Save hours" on the week editor: the days are checked again here and saved as the hours fact's
 * one normalized line ("Mon–Sat 8am–6pm, Sun closed"), like any other fact.
 */
export async function saveChatHours(input: {
  days: { day: string; open: string; close: string }[];
  entryId: string | null;
}): Promise<{ error?: string; line?: string }> {
  const parsed = hoursSchema.safeParse(input);
  if (!parsed.success) return { error: "Turn on at least one day, then save." };
  return storeFact("hours", formatHours(weekOf(parsed.data.days)), parsed.data.entryId);
}

/**
 * The answer editor's "Ask me instead" (the replica's): the saved answer is removed, so when a
 * customer asks it, the message comes to the owner. Unsent drafts that used it are written again.
 */
export async function askMeInstead(input: { entryId: string }): Promise<{ error?: string }> {
  const parsed = z.object({ entryId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { error: "Something went wrong. Please reload." };
  const tenant = await getTenantFor("brand.settings");
  if (!tenant) return { error: NOT_ALLOWED };
  const db = getServiceClient();
  const { data, error } = await db
    .from("kb_entries")
    .delete()
    .eq("id", parsed.data.entryId)
    .eq("tenant_id", tenant.id)
    .select("id");
  if (error || !data?.length) return { error: "Couldn’t save. Try again." };
  await writeAudit(db, {
    tenantId: tenant.id,
    action: "kb_entry_deleted",
    actor: tenant.userId,
    details: { kbEntryId: parsed.data.entryId, from: "setup_chat", via: "ask_me_instead" },
  });
  try {
    await redraftAfterAnswerChange(db, {
      tenantId: tenant.id,
      kbEntryId: parsed.data.entryId,
      actor: tenant.userId,
    });
  } catch (err) {
    Sentry.captureException(err, {
      extra: { tenantId: tenant.id, kbEntryId: parsed.data.entryId },
    });
  }
  return {};
}

async function storeFact(
  field: FactField,
  value: string,
  entryId: string | null,
): Promise<{ error?: string; line?: string }> {
  const tenant = await getTenantFor("brand.settings");
  if (!tenant) return { error: NOT_ALLOWED };
  const db = getServiceClient();
  let id: string;
  if (entryId) {
    const { data, error } = await db
      .from("kb_entries")
      .update({ content: value })
      .eq("id", entryId)
      .eq("tenant_id", tenant.id)
      .select("id");
    if (error || !data?.length) return { error: "Couldn’t save. Try again." };
    // Checked only once the owner's words are saved.
    await markFactChecked(db, {
      tenantId: tenant.id,
      kbEntryId: entryId,
      userId: tenant.userId,
      via: "edited",
    });
    id = entryId;
  } else {
    if (field === "answer") return { error: "Tap the answer to change first." };
    const { data, error } = await db
      .from("kb_entries")
      .insert({ tenant_id: tenant.id, title: FIELD_TITLE[field], content: value })
      .select("id")
      .single();
    if (error || !data) return { error: "Couldn’t save. Try again." };
    id = data.id;
    // The owner wrote it: checked (a no-op when the row starts checked).
    await markFactChecked(db, {
      tenantId: tenant.id,
      kbEntryId: id,
      userId: tenant.userId,
      via: "edited",
    });
  }
  await writeAudit(db, {
    tenantId: tenant.id,
    action: entryId ? "kb_entry_updated" : "kb_entry_created",
    actor: tenant.userId,
    details: { kbEntryId: id, from: "setup_chat", field },
  });
  const llm = getLlmClientOrNull();
  try {
    if (llm) await embedEntry({ db, llm }, id);
  } catch (err) {
    // The job sweep embeds it later.
    Sentry.captureException(err, { extra: { kbEntryId: id } });
  }
  let redrafted = 0;
  try {
    redrafted = await redraftAfterAnswerChange(db, {
      tenantId: tenant.id,
      kbEntryId: entryId,
      actor: tenant.userId,
    });
  } catch (err) {
    Sentry.captureException(err, { extra: { tenantId: tenant.id, kbEntryId: id } });
  }
  return { line: savedLine({ field, value, redrafted }) };
}
