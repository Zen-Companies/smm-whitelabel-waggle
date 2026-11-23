import { z } from "zod";
import { BUSINESS_KINDS, CUSTOM_KIND_MAX } from "./starter";

// Step 3 is a conversation with Waggle (boards "Step 3 is a conversation with Waggle" and
// "Replica update", approved 23 Nov). One thread, questions in the replica's fixed order (our
// cards, never the AI's): the kind of business (only when unknown) → the facts found → the replies
// Waggle wrote → the customers who need the owner → what to always check first → how replies go
// out → done. Each answer is saved as it's tapped (tenants.setup_chat: choices only, never
// customer text); everything else said in the thread is in chat-log.ts. A reload brings it all
// back. Answers are never cleared: changing one asks again at the bottom (23 Nov). Pure, tested.

export const CHAT_STEPS = [
  "kind",
  "facts",
  "missing",
  "replies",
  "needyou",
  "topics",
  "mode",
] as const;
export type ChatStep = (typeof CHAT_STEPS)[number];

export const isChatStep = (v: unknown): v is ChatStep =>
  typeof v === "string" && (CHAT_STEPS as readonly string[]).includes(v);

/** The facts card's lines Waggle asks for when they're missing (answers aren't). */
export const MISSING_FIELDS = ["hours", "address", "area", "contact", "price"] as const;
export type MissingField = (typeof MISSING_FIELDS)[number];

const KIND_KEYS = BUSINESS_KINDS.map((k) => k.key) as [string, ...string[]];

export const chatSavedSchema = z
  .object({
    kind: z.enum(KIND_KEYS),
    /** "Something else": what they typed. */
    kindWords: z.string().max(CUSTOM_KIND_MAX),
    facts: z.literal("ok"),
    /** The facts Waggle couldn't find when "Looks good" was tapped: asked next, one at a time. */
    toAsk: z.array(z.enum(MISSING_FIELDS)).max(MISSING_FIELDS.length),
    /** Each of those, saved or skipped for now. */
    missing: z.partialRecord(z.enum(MISSING_FIELDS), z.enum(["saved", "skipped"])),
    replies: z.enum(["sent", "skipped", "none"]),
    /** How many went (for "Sent N ✓" after a reload). */
    sent: z.number().int().min(0).max(1000),
    needyou: z.literal("done"),
    /** What to always check first: built-in ids and the owner's own ("custom:…"). */
    topics: z.array(z.string().max(80)).max(40),
    mode: z.enum(["approve", "auto"]),
    /** Step 2's "Skip for now" finished setup with the defaults: the chat is never shown. */
    skippedAnswers: z.literal(true),
    /** The owner's bubble as first answered (a later change shows at the bottom, not here). */
    labels: z.partialRecord(
      z.enum(["kind", "facts", "replies", "topics", "mode"]),
      z.string().max(1000),
    ),
  })
  .partial();
export type ChatSaved = z.infer<typeof chatSavedSchema>;

/** The saved answers, or none when the row holds something else. */
export function chatSavedOf(json: unknown): ChatSaved {
  const r = chatSavedSchema.safeParse(json);
  return r.success ? r.data : {};
}

/** Pure: the next missing fact to ask (not saved, not skipped), or null when none is left. */
export function nextMissing(
  toAsk: readonly MissingField[],
  done: ChatSaved["missing"],
): MissingField | null {
  return toAsk.find((f) => !done?.[f]) ?? null;
}

export interface ChatFacts {
  /** The kind is known (saved, or the profile's guess): Waggle doesn't ask it. */
  kindKnown: boolean;
  /** Replies Waggle wrote that aren't sent yet. */
  toSend: number;
  /** Replies still being written. */
  writing: boolean;
  /** Customers Waggle couldn't answer. */
  needYou: number;
  finished: boolean;
}

/**
 * Pure: which questions are answered and which one is open. A known kind, replies with nothing to
 * send (and not still writing) and need-you with nobody waiting answer themselves. The reply
 * choice counts once setup is finished (its tap finishes setup); then nothing is open (the end).
 */
export function chatProgress(
  saved: ChatSaved,
  f: ChatFacts,
): { answered: ChatStep[]; open: ChatStep | "done" } {
  const answered: ChatStep[] = [];
  const isAnswered: Record<ChatStep, boolean> = {
    kind: !!saved.kind || f.kindKnown,
    facts: saved.facts === "ok",
    // Only what was missing at "Looks good" is asked (a new kind's lines later show as "Not set
    // yet" on the card instead of pulling the thread back).
    missing: nextMissing(saved.toAsk ?? [], saved.missing) === null || f.finished,
    replies: !!saved.replies || (f.toSend === 0 && !f.writing),
    needyou: saved.needyou === "done" || f.needYou === 0,
    // Setups finished before this question existed have their topics already (asked again
    // when the reply choice or the topics are reopened).
    topics: !!saved.topics || (f.finished && !!saved.mode),
    mode: !!saved.mode && f.finished,
  };
  for (const s of CHAT_STEPS) {
    if (!isAnswered[s]) return { answered, open: s };
    answered.push(s);
  }
  return { answered, open: "done" };
}

/** Waggle's first words (the replica's). */
export const GREETING = "Hi! I’m Waggle, your assistant. I’ll answer your customers for you.";

/** The owner's answer bubble for the kind ("Café or restaurant", "Something else: dog grooming"). */
export function kindAnswer(kind: string, words?: string): string {
  const label = BUSINESS_KINDS.find((k) => k.key === kind)?.label ?? "Something else";
  return kind === "other" && words ? `Something else: ${words}` : label;
}

/** Pure: the line over the facts card: replies already written, or just the facts. */
export function factsIntro(platform: string, wroteReplies: boolean): string {
  return wroteReplies
    ? `I already wrote replies to your customers using what I found on your ${platform}. Before any go out, is this right?`
    : `Here’s what I found on your ${platform}. Before anything goes out, is this right?`;
}

/** Pure: "I wrote 3 replies, most important first. Nothing goes out until you send it." */
export function repliesQuestion(n: number): string {
  return n === 1
    ? "I wrote 1 reply. Nothing goes out until you send it."
    : `I wrote ${n} replies, most important first. Nothing goes out until you send it.`;
}

/** Pure: "1 customer is still waiting. I couldn’t answer from what I know. …" */
export function needYouLine(n: number): string | null {
  if (n === 0) return null;
  return n === 1
    ? "1 customer is still waiting. I couldn’t answer from what I know. Tell me the answer and I’ll write the reply."
    : `${n} customers are still waiting. I couldn’t answer them from what I know. Tell me the answers and I’ll write the replies.`;
}

/** Pure: the end's line, by how many replies wait for the owner's OK in the Inbox. */
export function allSetLine(ready: number): string {
  if (ready === 0) return "All set. New messages will show up in your inbox with a reply ready.";
  return ready === 1
    ? "All set. 1 reply is ready for your OK in your inbox."
    : `All set. ${ready} replies are ready for your OK in your inbox. Send them one by one, or all at once.`;
}

/** Pure: "Ask me first about: Refunds and complaints, Allergies and ingredients". */
export function topicsAnswer(labels: readonly string[]): string {
  return `Ask me first about: ${labels.join(", ")}`;
}
