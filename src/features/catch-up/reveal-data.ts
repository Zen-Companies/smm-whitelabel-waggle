import "server-only";
import type { Json } from "@/lib/supabase/database.types";
import type { ServiceClient } from "@/lib/supabase/service";
import { unansweredTopQuestions, waitingForTopQuestions } from "./busy-rules";
import {
  authorHandle,
  catchUpPhase,
  CLOSED_STATUSES,
  priceItemsFrom,
  readCachedTopQuestions,
  summarizeReveal,
} from "./reveal-rules";

// First connect: "Here's what you've been missing" (canvas board approved 20 Nov; decisions and
// edge cases in the doc "First connect: decisions and edge cases"). The contract between the
// catch-up engine (fills these) and the screens (read them). The rules are in reveal-rules.ts;
// the reading screen polls GET /api/catch-up/progress (loadCatchUpProgress) every 2 seconds.

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
  /** Some top questions are cached (early or final): setup's steps 3 and 4 refresh. */
  topQuestionsReady?: boolean;
  /** The final top questions are in (possibly none): setup stops waiting. */
  topQuestionsDone?: boolean;
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
  db: ServiceClient,
  tenantId: string,
  now: Date = new Date(),
): Promise<CatchUpProgress | null> {
  const row = await latestCatchUp(db, tenantId);
  if (!row) return null;
  return progressOf(db, row, now);
}

/** Everything the reveal shows, or null before the catch-up has anything to show. */
export async function loadReveal(
  db: ServiceClient,
  tenantId: string,
  now: Date = new Date(),
): Promise<RevealData | null> {
  const row = await latestCatchUp(db, tenantId);
  if (!row) return null;
  const progress = await progressOf(db, row, now);
  if (progress.phase === "reading") return null;

  const [{ data: items, error }, reviews, missed] = await Promise.all([
    db
      .from("inbound_items")
      .select("id, kind, category, status, text, author_name, received_at, post_caption")
      .eq("catch_up_id", row.id)
      .order("received_at", { ascending: false })
      .limit(SORT_CAP + 200),
    db
      .from("inbound_items")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("kind", "review")
      .not("status", "in", `(${CLOSED_STATUSES.join(",")})`),
    missedCount(db, row.social_account_id),
  ]);
  if (error) throw new Error(`reveal items lookup failed: ${error.message}`);
  const summary = summarizeReveal(
    (items ?? []).map((i) => ({
      id: i.id,
      kind: i.kind,
      category: i.category,
      status: i.status,
      text: i.text,
      authorName: i.author_name,
      receivedAt: i.received_at,
      postCaption: i.post_caption,
    })),
    now,
  );
  return {
    progress,
    waiting: progress.waiting,
    breakdown: {
      ...summary.breakdown,
      priceItems: priceItemsFrom(readCachedTopQuestions(row.top_questions)),
      reviewsUnanswered: reviews.count ?? 0,
    },
    notCounted: { praiseAndTags: row.praise_and_tags, spam: summary.spam },
    longestWait: summary.longestWait,
    expiringToday: summary.expiringToday,
    draftsReady: summary.draftsReady,
    missed,
  };
}

/**
 * The customers' most-asked questions, grouped by what they asked about (one AI call over the
 * items Jev marked as questions, cached). Empty when there aren't any yet.
 */
export async function loadTopQuestions(
  db: ServiceClient,
  tenantId: string,
): Promise<TopQuestion[]> {
  const row = await latestCatchUp(db, tenantId);
  return row ? readCachedTopQuestions(row.top_questions) : [];
}

/** Setup's steps 3 and 4 (busy accounts, 20 Nov): the top questions, and whether to wait for them. */
export interface TopQuestionsStatus {
  questions: TopQuestion[];
  /** A catch-up is still working and none are cached yet: show "still reading your inbox". */
  waiting: boolean;
}

export async function loadTopQuestionsStatus(
  db: ServiceClient,
  tenantId: string,
  now: Date = new Date(),
): Promise<TopQuestionsStatus> {
  const row = await latestCatchUp(db, tenantId);
  const questions = row ? readCachedTopQuestions(row.top_questions) : [];
  return {
    questions,
    waiting: waitingForTopQuestions({
      hasCatchUp: !!row,
      finalAt: row?.top_questions_final_at ?? null,
      cached: questions.length,
      startedAt: row ? new Date(row.created_at) : null,
      now,
    }),
  };
}

/**
 * "Your customers' top 3 questions are ready · Answer them" (Today and setup step 3): the newest
 * catch-up's top 3 questions not answered in the knowledge base yet, unless dismissed. Null when
 * there's nothing to show.
 */
export async function loadReadyLaterNotice(
  db: ServiceClient,
  tenantId: string,
): Promise<{ catchUpId: string; unanswered: number } | null> {
  const row = await latestCatchUp(db, tenantId);
  if (!row || row.top_questions_notice_dismissed_at) return null;
  const questions = readCachedTopQuestions(row.top_questions);
  if (!questions.length) return null;
  const { data: kb, error } = await db.from("kb_entries").select("title").eq("tenant_id", tenantId);
  if (error) throw new Error(`kb_entries lookup failed: ${error.message}`);
  const unanswered = unansweredTopQuestions(
    questions,
    (kb ?? []).map((e) => e.title),
  ).length;
  return unanswered ? { catchUpId: row.id, unanswered } : null;
}

type CatchUpRow = {
  id: string;
  social_account_id: string | null;
  stage: string;
  platform: string | null;
  handle: string | null;
  comments_found: number;
  praise_and_tags: number;
  capped: boolean;
  dm_access_missing: boolean;
  sorted_at: string | null;
  top_questions: Json | null;
  created_at: string;
  top_questions_final_at: string | null;
  top_questions_notice_dismissed_at: string | null;
};

/** The brand's newest catch-up (one per connected Instagram/Facebook account). */
async function latestCatchUp(db: ServiceClient, tenantId: string): Promise<CatchUpRow | null> {
  const { data, error } = await db
    .from("catch_ups")
    .select(
      "id, social_account_id, stage, platform, handle, comments_found, praise_and_tags, capped, dm_access_missing, sorted_at, top_questions, created_at, top_questions_final_at, top_questions_notice_dismissed_at",
    )
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`catch_ups lookup failed: ${error.message}`);
  return data;
}

async function progressOf(db: ServiceClient, row: CatchUpRow, now: Date): Promise<CatchUpProgress> {
  const pulled = () =>
    db.from("inbound_items").select("id", { count: "exact", head: true }).eq("catch_up_id", row.id);
  const [dms, waiting, draftsPending, missed, account] = await Promise.all([
    pulled().eq("kind", "dm"),
    pulled()
      .in("category", ["faq", "lead", "complaint"])
      .not("status", "in", `(${CLOSED_STATUSES.join(",")})`),
    pulled().not("draft_requested_at", "is", null).in("status", ["new", "classified", "drafted"]),
    missedCount(db, row.social_account_id),
    row.platform && row.handle
      ? Promise.resolve({ data: { platform: row.platform, username: row.handle } })
      : row.social_account_id
        ? db
            .from("social_accounts")
            .select("platform, username")
            .eq("id", row.social_account_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
  ]);
  const platform = row.platform ?? account.data?.platform ?? "instagram";
  return {
    catchUpId: row.id,
    phase: catchUpPhase({
      stage: row.stage,
      sortedAt: row.sorted_at,
      draftsPending: draftsPending.count ?? 0,
      now,
    }),
    platform,
    handle: authorHandle(row.handle ?? account.data?.username ?? null),
    commentsFound: row.comments_found,
    messagesFound: (dms.count ?? 0) + missed,
    waiting: waiting.count ?? 0,
    capped: row.capped,
    dmAccessMissing: row.dm_access_missing,
    topQuestionsReady: readCachedTopQuestions(row.top_questions).length > 0,
    topQuestionsDone: row.top_questions_final_at !== null,
  };
}

/** Older DMs past the window (missed_messages are per account; none once it was deleted). */
async function missedCount(db: ServiceClient, socialAccountId: string | null): Promise<number> {
  if (!socialAccountId) return 0;
  const { count } = await db
    .from("missed_messages")
    .select("id", { count: "exact", head: true })
    .eq("social_account_id", socialAccountId);
  return count ?? 0;
}
