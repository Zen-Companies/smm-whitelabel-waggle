import { z } from "zod";
import { CHAT_STEPS, MISSING_FIELDS, type ChatStep, type MissingField } from "./chat";
import { FACT_FIELDS, TYPED_MAX, UNSUPPORTED, type FactField } from "./chat-fields";
import { openDaysSchema } from "./chat-hours";

// Step 3's thread history (user feedback, 23 Nov): everything said in the chat besides the fixed
// questions (the owner's typed words, Waggle's answers, Save / Not quite cards, fixes, feedback,
// changes to earlier answers) is one append-only list, saved server-side in
// tenants.setup_chat_log (tenant-scoped; kept until setup is finished + LOG_KEEP_DAYS, then purged
// by a daily job and ignored when read). Nothing is ever cut: changing an earlier answer appends a
// new turn at the bottom. Each entry remembers which question was open when it was said (`at`), so
// the thread places it under that question. Pure, tested.

/** Where an entry sits: under the question that was open when it was said, or after the end. */
export const ANCHORS = [...CHAT_STEPS, "done"] as const;
export type Anchor = ChatStep | "done";

/** The most entries kept (the oldest drop first). */
export const LOG_MAX = 200;
/** Days the thread is kept after setup is finished. */
export const LOG_KEEP_DAYS = 30;
const TEXT_MAX = 1000;
const FEEDBACK_MAX = 4000;

/** What an earlier answer tapped asks again, at the bottom. */
export const ASK_WHATS = ["kind", "facts", "replies", "topics", "mode"] as const;
export type AskWhat = (typeof ASK_WHATS)[number];

const field = z.enum(FACT_FIELDS);
const text = z.string().max(TEXT_MAX);

const typedTurnSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("propose"),
    field,
    value: z.string().max(2000),
    entryId: z.string().max(64).nullable(),
    before: z.string().max(4000).nullable(),
  }),
  /** The week editor (Fix hours, the missing hours, a typed hours change). */
  z.object({
    kind: z.literal("hours"),
    days: openDaysSchema,
    entryId: z.string().max(64).nullable(),
    unread: z.boolean(),
  }),
  /** The replica's address and contact editors (24 Nov). */
  z.object({
    kind: z.enum(["address", "contact"]),
    value: z.string().max(4000),
    entryId: z.string().max(64).nullable(),
    unread: z.boolean(),
  }),
  /** The replica's answer editor ("Which one?" while entryId is null). */
  z.object({
    kind: z.literal("answer"),
    entryId: z.string().max(64).nullable(),
    value: z.string().max(2000).nullable(),
    which: z.boolean(),
  }),
  /** "Should I update my answer to … too?" after new hours. */
  z.object({
    kind: z.literal("sync"),
    entryId: z.string().max(64),
    label: z.string().max(300),
    value: z.string().max(4000),
  }),
  z.object({ kind: z.literal("ask_which"), field: field.nullable() }),
  z.object({ kind: z.literal("unsupported"), feature: z.enum(UNSUPPORTED) }),
  z.object({ kind: z.literal("off_topic") }),
  z.object({ kind: z.literal("secret") }),
  z.object({ kind: z.literal("limited") }),
  z.object({ kind: z.literal("error") }),
]);

const knownFactSchema = z.object({
  id: z.string().max(64),
  field,
  label: z.string().max(300),
  value: z.string().max(4000),
});

const base = { id: z.number().int().min(1), at: z.enum(ANCHORS) };

export const logEntrySchema = z.discriminatedUnion("who", [
  z.object({ ...base, who: z.literal("me"), text }),
  z.object({ ...base, who: z.literal("waggle"), text }),
  z.object({
    ...base,
    who: z.literal("turn"),
    turn: typedTurnSchema,
    typed: z.string().max(TYPED_MAX),
  }),
  z.object({
    ...base,
    who: z.literal("which"),
    text,
    options: z.array(knownFactSchema).max(8),
  }),
  z.object({
    ...base,
    who: z.literal("feedback"),
    text: z.string().max(FEEDBACK_MAX),
    sent: z.boolean(),
  }),
  /** An earlier answer tapped: that question again, at the bottom (live until answered). */
  z.object({ ...base, who: z.literal("ask"), what: z.enum(ASK_WHATS), done: z.boolean() }),
  /** One of the facts Waggle couldn't find, asked after "Looks good". */
  z.object({ ...base, who: z.literal("missing"), field: z.enum(MISSING_FIELDS) }),
]);
export type LogEntry = z.infer<typeof logEntrySchema>;

type WithoutBase<T> = T extends unknown ? Omit<T, "id" | "at"> : never;
export type NewEntry = WithoutBase<LogEntry>;

const NEED_KINDS = ["reply", "queued", "still", "sent", "later"] as const;
export type NeedKind = (typeof NEED_KINDS)[number];

export const chatLogSchema = z.object({
  entries: z.array(logEntrySchema).max(LOG_MAX),
  /**
   * What happened to each customer who needed the owner, by item id: the outcome and the name
   * shown (never the message), so the thread keeps it after they leave the waiting list.
   */
  need: z.record(
    z.string().max(64),
    z.object({ kind: z.enum(NEED_KINDS), author: z.string().max(200) }),
  ),
});
export type ChatLog = z.infer<typeof chatLogSchema>;

export const EMPTY_LOG: ChatLog = { entries: [], need: {} };

/**
 * Pure: the saved thread, or an empty one when the row holds something else or setup was finished
 * more than LOG_KEEP_DAYS ago (the daily purge may not have run yet).
 */
export function chatLogOf(json: unknown, keep: { doneAt: string | null; now: Date }): ChatLog {
  if (keep.doneAt) {
    const age = keep.now.getTime() - new Date(keep.doneAt).getTime();
    if (age > LOG_KEEP_DAYS * 86_400_000) return EMPTY_LOG;
  }
  const r = chatLogSchema.safeParse(json);
  return r.success ? r.data : EMPTY_LOG;
}

/** Pure: entries added at the end, under `at`, with fresh ids; the oldest drop past LOG_MAX. */
export function addEntries(log: readonly LogEntry[], add: NewEntry[], at: Anchor): LogEntry[] {
  let id = log.reduce((m, e) => Math.max(m, e.id), 0);
  const next = [...log, ...add.map((e) => ({ ...e, id: ++id, at }) as LogEntry)];
  return next.length > LOG_MAX ? next.slice(next.length - LOG_MAX) : next;
}

/** Pure: the earlier answer being asked again (only the newest can be open). */
export function pendingAsk(
  log: readonly LogEntry[],
): Extract<LogEntry, { who: "ask" }> | undefined {
  for (let i = log.length - 1; i >= 0; i -= 1) {
    const e = log[i];
    if (e.who === "ask") return e.done ? undefined : e;
  }
  return undefined;
}

/** Pure: every open ask closed (one was answered, or a new one replaces it). */
export function closeAsks(log: readonly LogEntry[]): LogEntry[] {
  return log.map((e) => (e.who === "ask" && !e.done ? { ...e, done: true } : e));
}

/** Pure: an earlier answer tapped: the open ask closes and this one opens at the bottom. */
export function askAgain(log: readonly LogEntry[], what: AskWhat, at: Anchor): LogEntry[] {
  return addEntries(closeAsks(log), [{ who: "ask", what, done: false }], at);
}

/** Pure: the entries said while `at` was open, in order. */
export function entriesAt(log: readonly LogEntry[], at: Anchor): LogEntry[] {
  return log.filter((e) => e.at === at);
}

// ---- the facts Waggle couldn't find (asked one at a time after "Looks good") --------------------

export const isMissingField = (f: FactField): f is MissingField =>
  (MISSING_FIELDS as readonly string[]).includes(f);

/** Pure: the facts card's lines with no value yet, in the card's order (answers aren't asked). */
export function missingFields(
  rows: readonly { field: FactField; value: string | null }[],
): MissingField[] {
  const out: MissingField[] = [];
  for (const r of rows) {
    if (r.value || !isMissingField(r.field) || out.includes(r.field)) continue;
    out.push(r.field);
  }
  return out;
}

/**
 * Pure: whether the question for `field` has to be (re)said at the bottom: it was never asked, or
 * something else (an earlier answer changed) came after the last time it was.
 */
export function missingNeedsAsking(log: readonly LogEntry[], field: MissingField): boolean {
  for (let i = log.length - 1; i >= 0; i -= 1) {
    const e = log[i];
    if (e.who === "missing") return e.field !== field;
    if (e.who === "ask") return true;
  }
  return true;
}

export const MISSING_INTRO =
  "A few things I couldn’t find. Tell me and I’ll add them, or skip any for now.";

export const MISSING_QUESTION: Record<MissingField, string> = {
  hours: "What are your opening hours?",
  address: "What’s your address?",
  area: "What area do you cover?",
  contact: "How can customers reach you? A phone number, email or website.",
  price: "What are your prices? The main ones are enough.",
};

/** Pure: Waggle's line after the kind changed, with any check-first topics the new kind adds. */
export function kindChangedLine(label: string, added: readonly string[]): string {
  const lead = `Got it, ${label}. I’ve updated your business.`;
  if (added.length === 0) return lead;
  return `${lead} I’ll also always check with you first about: ${added.join(", ")}.`;
}

/** Pure: Waggle's line after the business name was saved (and replies that said the old one). */
export function nameSavedLine(redrafted: number): string {
  if (redrafted <= 0) return "Got it. That’s your business name now.";
  return redrafted === 1
    ? "Got it. I’m rewriting the 1 reply that used the old name."
    : `Got it. I’m rewriting the ${redrafted} replies that used the old name.`;
}

export const BACK_LINE = "Back to where we were.";
