import "server-only";
import type { ServiceClient } from "@/lib/supabase/service";

// First connect: "Here's what you've been missing" (canvas board approved 20 Nov; decisions and
// edge cases in the doc "First connect: decisions and edge cases"). The contract between the
// catch-up engine (fills these) and the screens (read them). Stubs until the engine lands.

/** Jev sorts at most this many pulled items per account; counts above it read "500+". */
export const SORT_CAP = 500;
/** Drafts made for the reveal; the rest are drafted when the owner opens them. */
export const REVEAL_DRAFTS = 20;

export type CatchUpPhase = "reading" | "sorting" | "drafting" | "ready";

/** The live counters on "Reading your inbox…" (asked for every 2 seconds). */
export interface CatchUpProgress {
  catchUpId: string;
  phase: CatchUpPhase;
  platform: string;
  /** @handle of the connected account, for "Connected @x. Not the right one? Switch". */
  handle: string | null;
  commentsFound: number;
  messagesFound: number;
  /** Questions, leads and complaints with no reply yet (never praise, friend tags or spam). */
  waiting: number;
  /** More than SORT_CAP items were found: counts read "500+". */
  capped: boolean;
  /** Instagram's message access is off, or the messages permission wasn't granted. */
  dmAccessMissing: boolean;
}

export interface PriceItem {
  /** What was asked about: "Winter menu box", "Oat latte". */
  item: string;
  count: number;
}

export interface RevealData {
  progress: CatchUpProgress;
  /** The big number: customers who waited (questions, leads, complaints). */
  waiting: number;
  breakdown: {
    price: number;
    priceItems: PriceItem[];
    booking: number;
    hours: number;
    otherQuestions: number;
    complaints: number;
    reviewsUnanswered: number;
  };
  /** Shown as "Not counted: N nice comments and friend tags, M spam". */
  notCounted: { praiseAndTags: number; spam: number };
  /**
   * The longest wait: a question COMMENT only (comments can be answered at any age), trimmed,
   * never a complaint or anything with a phone number, email or health detail. By @handle.
   */
  longestWait: {
    itemId: string;
    handle: string;
    text: string;
    daysWaiting: number;
    postLabel: string | null;
  } | null;
  /** DMs still inside Meta's 24-hour window, soonest to expire first. */
  expiringToday: { itemId: string; handle: string; text: string; expiresAt: string }[];
  /** Drafts ready to approve (up to REVEAL_DRAFTS). */
  draftsReady: number;
  /** Older DMs past the window: counted and shown read-only, never drafted. */
  missed: number;
}

export interface TopQuestion {
  /** The question as customers ask it: "How much is it?". */
  question: string;
  /** How many asked it. */
  count: number;
  /** For an ambiguous question, what it was about (from the post's caption or the DM). */
  items: PriceItem[];
  /** Asked with no clear item: counted, never guessed. */
  unsure: number;
}

/** The counters for the reading screen, or null when the brand has no catch-up. */
export async function loadCatchUpProgress(
  _db: ServiceClient,
  _tenantId: string,
): Promise<CatchUpProgress | null> {
  return null;
}

/** Everything the reveal shows, or null before the catch-up has anything to show. */
export async function loadReveal(
  _db: ServiceClient,
  _tenantId: string,
): Promise<RevealData | null> {
  return null;
}

/**
 * The customers' most-asked questions, grouped by what they asked about (one AI call over the
 * items Jev marked as questions, cached). Empty when there aren't any yet.
 */
export async function loadTopQuestions(
  _db: ServiceClient,
  _tenantId: string,
): Promise<TopQuestion[]> {
  return [];
}
