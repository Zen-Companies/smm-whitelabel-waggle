import { z } from "zod";
import type { CatchUpPhase, TopQuestion } from "./reveal-data";

// First connect engine (decided 20 Nov): the pure rules behind the reading screen and the reveal.
// The job (job.ts), the finishing pass (finish.ts) and the loaders (reveal-data.ts) call these.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Read at most this many posts and comments per account (DM conversations: Zernio's 100). */
export const MAX_POSTS_READ = 100;
export const MAX_COMMENTS_READ = 1000;

// ---------------------------------------------------------------------------------------------
// Not everything needs a reply.

const MENTION = /@[\p{L}\p{N}._]+/gu;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

/** Words a short praise or thanks is made of ("love this!", "so good", "thank you po"). */
const PRAISE_WORDS = new Set([
  // praise
  "love",
  "loved",
  "loving",
  "lovely",
  "amazing",
  "beautiful",
  "gorgeous",
  "good",
  "great",
  "awesome",
  "nice",
  "wow",
  "yum",
  "yummy",
  "delicious",
  "tasty",
  "perfect",
  "stunning",
  "cute",
  "pretty",
  "best",
  "wonderful",
  "fantastic",
  "incredible",
  "cool",
  "fab",
  "fabulous",
  "excellent",
  "brilliant",
  "superb",
  "sweet",
  "fire",
  "goals",
  "slay",
  "yay",
  "yes",
  "omg",
  "congrats",
  "congratulations",
  "happy",
  "obsessed",
  "beautifully",
  "insane",
  "epic",
  "legend",
  "goat",
  "bravo",
  "outstanding",
  "magnificent",
  "adorable",
  "heaven",
  "heavenly",
  // thanks
  "thank",
  "thanks",
  "thx",
  "thnx",
  "ty",
  "tysm",
  "appreciate",
  "appreciated",
  "cheers",
  "gracias",
  "merci",
  "danke",
  "grazie",
  "obrigado",
  "obrigada",
  "salamat",
  "arigato",
  // Tagalog / Taglish praise
  "ganda",
  "sarap",
  "galing",
  "angas",
  "solid",
  "lodi",
  "petmalu",
  "po",
  "naman",
  "talaga",
  "grabe",
  "sobrang",
  "ang",
  // glue
  "this",
  "that",
  "these",
  "it",
  "is",
  "so",
  "very",
  "really",
  "much",
  "you",
  "u",
  "a",
  "lot",
  "lots",
  "the",
  "absolutely",
  "totally",
  "just",
  "looks",
  "look",
  "looking",
  "well",
  "done",
  "work",
  "job",
  "i",
  "we",
  "all",
  "and",
  "for",
  "sharing",
  "of",
  "always",
  "as",
  "usual",
  "ever",
  "too",
  "guys",
  "team",
  "xx",
  "xo",
  "xoxo",
  "haha",
  "hahaha",
  "lol",
  "lmao",
  "hehe",
  "ah",
  "oh",
  "ooh",
  "aww",
  "aw",
  "my",
  "god",
  "gosh",
  "place",
  "food",
  "vibes",
  "vibe",
  "here",
]);
/** A praise comment is short: anything longer probably says more than thanks. */
const PRAISE_MAX_WORDS = 8;

/** The comment without its @mentions. */
const withoutMentions = (text: string): string => text.replace(MENTION, " ");

/** Only @mentions (friend tags), nothing else said. */
export function isTagOnly(text: string): boolean {
  MENTION.lastIndex = 0;
  if (!MENTION.test(text)) return false;
  return !LETTER_OR_DIGIT.test(withoutMentions(text));
}

/**
 * Whether a comment needs an answer from the business. Conservative: when unsure, it does.
 * Not answered: empty, emoji-only or punctuation-only, only @mentions, or short praise or thanks
 * ("love this!", "thank you 😍", "so good po"). Anything with a question mark needs a reply.
 */
export function needsReply(text: string): boolean {
  const rest = withoutMentions(text).trim();
  // A bare "?" under a post usually means "how much?": a question mark always needs a reply.
  if (rest.includes("?") || rest.includes("？")) return true;
  if (!LETTER_OR_DIGIT.test(rest)) return false;
  const words = rest
    .toLowerCase()
    .normalize("NFKC")
    // "loooove" → "love", "sooo" → "so" (three or more of a letter)
    .replace(/(\p{L})\1{2,}/gu, "$1")
    .split(/[^\p{L}\p{N}']+/u)
    .map((w) => w.replace(/^'+|'+$/g, ""))
    .filter(Boolean);
  if (words.length === 0) return false;
  if (words.length > PRAISE_MAX_WORDS) return true;
  return !words.every((w) => PRAISE_WORDS.has(w.replace(/'s$/, "")));
}

/** A giveaway post: most of its comments only tag friends. Below this many, never a giveaway. */
export const GIVEAWAY_MIN_COMMENTS = 10;
export function isGiveawayPost(customerComments: string[]): boolean {
  if (customerComments.length < GIVEAWAY_MIN_COMMENTS) return false;
  const tags = customerComments.filter(isTagOnly).length;
  return tags / customerComments.length > 0.5;
}

// ---------------------------------------------------------------------------------------------
// Caps.

/** How many more comments may be read, and whether another post may be opened. */
export function readBudget(input: { postsRead: number; commentsRead: number }): {
  morePosts: boolean;
  commentsLeft: number;
} {
  const commentsLeft = Math.max(0, MAX_COMMENTS_READ - input.commentsRead);
  return { morePosts: input.postsRead < MAX_POSTS_READ && commentsLeft > 0, commentsLeft };
}

/**
 * Whether a found comment goes into the pipeline (Jev sorts it) or is only counted. Pulled
 * newest post first, so the first `cap` are the newest. DMs inside the 24-hour window are always
 * sorted (few, and the ones about to expire).
 */
export function underSortCap(sortedSoFar: number, cap: number): boolean {
  return sortedSoFar < cap;
}

// ---------------------------------------------------------------------------------------------
// The longest wait, quoted.

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/u;
/** Seven or more digits, allowing spaces, dots, dashes and brackets between them. */
const PHONE = /(?:\+?\d[\s().-]*){7,}/;
const HEALTH =
  /\b(pregnan\w*|allerg\w*|anaphyla\w*|diabet\w*|celiac|coeliac|gluten[- ]intoleran\w*|medicat\w*|medicine|prescription\w*|surgery|surgeries|cancer|chemo\w*|tumou?r|injur\w*|pain|disease\w*|illness|sick|symptom\w*|diagnos\w*|therap\w*|anxiety|depress\w*|adhd|autis\w*|hiv|std|sti|infection\w*|rash\w*|blood|doctor|dr\.?|hospital|epilep\w*|asthma\w*|disab\w*|mental health|miscarr\w*|ivf|fertility|insulin)\b/i;

/** Safe to show on the reveal: no phone number, email address or health detail. */
export function safeToQuote(text: string): boolean {
  return !EMAIL.test(text) && !PHONE.test(text) && !HEALTH.test(text);
}

/** One line, at most `max` characters, cut at a word with "…". */
export function quoteText(text: string, max = 120): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  const atWord = cut.lastIndexOf(" ");
  return `${(atWord > max * 0.6 ? cut.slice(0, atWord) : cut).trimEnd()}…`;
}

/** A post named by the start of its caption ("Winter menu is here…"), or null without one. */
export function postLabel(caption: string | null | undefined, max = 40): string | null {
  const flat = (caption ?? "").replace(/\s+/g, " ").trim();
  return flat ? quoteText(flat, max) : null;
}

export const daysBetween = (fromIso: string, now: Date): number =>
  Math.max(0, Math.floor((now.getTime() - Date.parse(fromIso)) / DAY_MS));

// ---------------------------------------------------------------------------------------------
// The breakdown.

export type QuestionTopic = "price" | "booking" | "hours" | "other";

const PRICE =
  /(\bhow much\b|\bprices?\b|\bpricing\b|\bcosts?\b|\brates?\b|\bfees?\b|\bmagkano\b|\bhm po\b|\bcu[aá]nto\b|\bprecios?\b|\bcombien\b|\bprix\b|[$€£₱])/i;
const BOOKING =
  /\b(book|booking|bookings|booked|reserve|reservation|reservations|appointment|appointments|available|availability|slots?|schedule|sched|table for|walk[- ]?ins?|vacan\w*|reserva\w*)\b/i;
const HOURS =
  /\b(open|opening|opens|hours|close|closing|closes|what time|anong oras|bukas|horario)\b/i;

/** What a question or lead is about, from its text: price, booking, hours or other. */
export function questionTopic(text: string): QuestionTopic {
  if (PRICE.test(text)) return "price";
  if (BOOKING.test(text)) return "booking";
  if (HOURS.test(text)) return "hours";
  return "other";
}

// ---------------------------------------------------------------------------------------------
// Sort, then draft.

export type PulledItem = {
  id: string;
  kind: string;
  category: string | null;
  status: string;
  receivedAt: string;
  draftRequested: boolean;
};

/** A pulled DM is drafted only with this much of Meta's 24-hour window left to send it. */
export const DM_DRAFT_MARGIN_MS = 60 * 60 * 1000;

/**
 * The reveal's drafts: undrafted pulled questions and leads (status awaiting_draft), newest
 * first, never a DM whose 24-hour window is (nearly) closed, until `cap` drafts have been asked
 * for in this catch-up (opened ones count too).
 */
export function pickRevealDrafts(items: PulledItem[], now: Date, cap: number): string[] {
  const asked = items.filter((i) => i.draftRequested).length;
  const room = Math.max(0, cap - asked);
  if (room === 0) return [];
  return items
    .filter(
      (i) =>
        !i.draftRequested &&
        i.status === "awaiting_draft" &&
        (i.category === "faq" || i.category === "lead") &&
        (i.kind === "comment" ||
          (i.kind === "dm" &&
            Date.parse(i.receivedAt) + DAY_MS - DM_DRAFT_MARGIN_MS > now.getTime())),
    )
    .sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt))
    .slice(0, room)
    .map((i) => i.id);
}

/** Sorting has stalled (no classifier, an outage): the reveal goes on after this long. */
export const SORT_STALL_MS = 15 * 60 * 1000;
/** Drafting has stalled (no LLM, the AI cap): the reveal is ready after this long anyway. */
export const DRAFT_STALL_MS = 10 * 60 * 1000;

/** Whether the finishing pass may pick the drafts: nothing left to sort, or sorting stalled. */
export function readyToPick(input: { unsorted: number; readAt: Date | null; now: Date }): boolean {
  if (input.unsorted === 0) return true;
  return !!input.readAt && input.now.getTime() - input.readAt.getTime() >= SORT_STALL_MS;
}

/**
 * The reading screen's phase: reading (pulling comments and DMs) → sorting (Jev hasn't sorted
 * everything, or the drafts aren't picked yet) → drafting (picked drafts not written yet) → ready.
 */
export function catchUpPhase(input: {
  stage: string;
  sortedAt: string | null;
  draftsPending: number;
  now: Date;
}): CatchUpPhase {
  if (input.stage === "comments" || input.stage === "dms") return "reading";
  if (!input.sortedAt) return "sorting";
  const stalled = input.now.getTime() - Date.parse(input.sortedAt) >= DRAFT_STALL_MS;
  if (input.draftsPending > 0 && !stalled) return "drafting";
  return "ready";
}

// ---------------------------------------------------------------------------------------------
// Top questions (one AI call, validated).

export const TOP_QUESTIONS_MAX = 8;
/** Questions sent to the AI: the newest ones, each trimmed. */
export const TOP_QUESTIONS_INPUT_MAX = 150;
export const TOP_QUESTION_TEXT_MAX = 300;

export const topQuestionsOutputSchema = z.object({
  questions: z
    .array(
      z.object({
        question: z.string().trim().min(1).max(200),
        /** Ids of the messages (as numbered in the prompt) asking it. */
        messages: z.array(z.number().int().nonnegative()).max(TOP_QUESTIONS_INPUT_MAX),
        /** For an ambiguous question: what each message was about, or null when unclear. */
        about: z
          .array(
            z.object({
              message: z.number().int().nonnegative(),
              item: z.string().trim().max(80).nullable(),
            }),
          )
          .max(TOP_QUESTIONS_INPUT_MAX)
          .default([]),
      }),
    )
    .max(TOP_QUESTIONS_MAX * 2),
});
export type TopQuestionsOutput = z.infer<typeof topQuestionsOutputSchema>;

/**
 * The AI's grouping as TopQuestion[]: counts come from the messages it cited (each message
 * counted once, only ids that exist), items from what it said each was about (null or missing →
 * unsure, never guessed), most asked first.
 */
export function toTopQuestions(output: TopQuestionsOutput, messageCount: number): TopQuestion[] {
  const used = new Set<number>();
  const result: TopQuestion[] = [];
  for (const q of output.questions) {
    const ids = [...new Set(q.messages)].filter((n) => n < messageCount && !used.has(n));
    if (ids.length === 0) continue;
    ids.forEach((n) => used.add(n));
    const aboutOf = new Map(q.about.map((a) => [a.message, a.item?.trim() || null]));
    const counts = new Map<string, { item: string; count: number }>();
    let unsure = 0;
    const anyItem = ids.some((n) => aboutOf.get(n));
    for (const n of ids) {
      const item = aboutOf.get(n);
      if (!item) {
        if (anyItem) unsure += 1;
        continue;
      }
      const key = item.toLowerCase();
      const c = counts.get(key) ?? { item, count: 0 };
      c.count += 1;
      counts.set(key, c);
    }
    result.push({
      question: q.question,
      count: ids.length,
      items: [...counts.values()].sort((a, b) => b.count - a.count),
      unsure,
    });
  }
  return result.sort((a, b) => b.count - a.count).slice(0, TOP_QUESTIONS_MAX);
}

/** The cached top questions, read back defensively (a malformed cache reads as none). */
const cachedSchema = z.array(
  z.object({
    question: z.string(),
    count: z.number().int().nonnegative(),
    items: z.array(z.object({ item: z.string(), count: z.number().int().nonnegative() })),
    unsure: z.number().int().nonnegative(),
  }),
);
export function readCachedTopQuestions(value: unknown): TopQuestion[] {
  const parsed = cachedSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

// ---------------------------------------------------------------------------------------------
// Keyed on the real account.

/**
 * The keys a catch-up is known by: platform + handle (a reconnect keeps the handle even when
 * Zernio issues a new account id), and platform + Zernio's account id (a renamed account). The
 * first is stored as account_key; both are looked up before starting.
 */
export function catchUpAccountKeys(input: {
  platform: string;
  username: string | null;
  zernioAccountId: string;
}): { primary: string; all: string[] } {
  const byId = `${input.platform}:zernio:${input.zernioAccountId}`;
  const handle = (input.username ?? "").trim().replace(/^@/, "").toLowerCase();
  if (!handle) return { primary: byId, all: [byId] };
  const byHandle = `${input.platform}:@${handle}`;
  return { primary: byHandle, all: [byHandle, byId] };
}

// ---------------------------------------------------------------------------------------------
// The reveal, from the pulled items.

/** Statuses after which an item no longer waits for anyone. */
export const CLOSED_STATUSES = ["sent", "handled", "rejected", "ignored"] as const;
const isOpen = (status: string) => !(CLOSED_STATUSES as readonly string[]).includes(status);

export type RevealItem = {
  id: string;
  kind: string;
  category: string | null;
  status: string;
  text: string;
  authorName: string | null;
  receivedAt: string;
  postCaption: string | null;
};

/** "@mika" for a username, a Page user's name as it is. */
export function authorHandle(name: string | null): string | null {
  const n = (name ?? "").trim().replace(/^@/, "");
  if (!n) return null;
  return /\s/.test(n) ? n : `@${n}`;
}

/** Waiting: a question, lead or complaint nobody answered yet (never praise, tags or spam). */
export const isWaiting = (i: { category: string | null; status: string }): boolean =>
  (i.category === "faq" || i.category === "lead" || i.category === "complaint") && isOpen(i.status);

/**
 * The reveal's numbers from a catch-up's pulled items (pure): the waiting count and its
 * breakdown, spam not counted, the longest-waiting quotable question comment, the DMs about to
 * lose their 24-hour window, and the drafts ready.
 */
export function summarizeReveal(items: RevealItem[], now: Date) {
  const waitingItems = items.filter(isWaiting);
  const breakdown = { price: 0, booking: 0, hours: 0, otherQuestions: 0, complaints: 0 };
  for (const i of waitingItems) {
    if (i.category === "complaint") {
      breakdown.complaints += 1;
      continue;
    }
    const topic = questionTopic(i.text);
    if (topic === "price") breakdown.price += 1;
    else if (topic === "booking") breakdown.booking += 1;
    else if (topic === "hours") breakdown.hours += 1;
    else breakdown.otherQuestions += 1;
  }

  const longest = items
    .filter(
      (i) =>
        i.kind === "comment" &&
        i.category === "faq" &&
        isOpen(i.status) &&
        authorHandle(i.authorName) !== null &&
        safeToQuote(i.text),
    )
    .sort((a, b) => Date.parse(a.receivedAt) - Date.parse(b.receivedAt))[0];

  const expiringToday = items
    .filter((i) => i.kind === "dm" && isWaiting(i))
    .map((i) => ({ i, expires: Date.parse(i.receivedAt) + DAY_MS }))
    .filter((e) => e.expires > now.getTime())
    .sort((a, b) => a.expires - b.expires)
    .map(({ i, expires }) => ({
      itemId: i.id,
      handle: authorHandle(i.authorName) ?? "",
      text: quoteText(i.text),
      expiresAt: new Date(expires).toISOString(),
    }));

  return {
    waiting: waitingItems.length,
    breakdown,
    spam: items.filter((i) => i.category === "spam").length,
    longestWait: longest
      ? {
          itemId: longest.id,
          handle: authorHandle(longest.authorName) ?? "",
          text: quoteText(longest.text),
          daysWaiting: daysBetween(longest.receivedAt, now),
          postLabel: postLabel(longest.postCaption),
        }
      : null,
    expiringToday,
    draftsReady: items.filter((i) => i.status === "awaiting_approval").length,
  };
}

// ---------------------------------------------------------------------------------------------
// Redraft on answer change.

/** At most this many pulled drafts are rewritten per answer saved (bounded AI cost). */
export const REDRAFT_MAX = 25;

/**
 * Which undecided pulled drafts an answer change could improve: drafts that used the changed (or
 * deleted) answer, and drafts that had no answer to go on (needs a human). A new answer has no
 * drafts using it yet, so only the second kind. A changed business name (`mentions`, 24 Nov)
 * picks only the drafts whose text says the old name. Newest first, at most REDRAFT_MAX.
 */
export function pickRedrafts(
  drafts: {
    id: string;
    itemId: string;
    kbEntryIds: string[];
    needsHuman: boolean;
    createdAt: string;
    /** The draft's text as it would go out (the owner's edit, else Waggle's). */
    body?: string;
  }[],
  changedEntryId: string | null,
  mentions?: string,
): { id: string; itemId: string }[] {
  const said = mentions?.trim().toLowerCase();
  return drafts
    .filter((d) =>
      said
        ? !!d.body?.toLowerCase().includes(said)
        : d.needsHuman || (changedEntryId !== null && d.kbEntryIds.includes(changedEntryId)),
    )
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, REDRAFT_MAX)
    .map((d) => ({ id: d.id, itemId: d.itemId }));
}

/** Price items for the breakdown: the items of the top questions about price, merged. */
export function priceItemsFrom(questions: TopQuestion[]): { item: string; count: number }[] {
  const merged = new Map<string, { item: string; count: number }>();
  for (const q of questions) {
    if (questionTopic(q.question) !== "price") continue;
    for (const it of q.items) {
      const key = it.item.toLowerCase();
      const m = merged.get(key) ?? { item: it.item, count: 0 };
      m.count += it.count;
      merged.set(key, m);
    }
  }
  return [...merged.values()].sort((a, b) => b.count - a.count);
}
