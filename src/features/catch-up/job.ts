import * as Sentry from "@sentry/nextjs";
import { insertInboundItem, recordConversation } from "@/features/inbox";
import { writeAudit } from "@/lib/audit";
import { getPlatformPause, recordPlatformPause } from "@/lib/social/platform-pause";
import { hasLiveComments } from "@/lib/social/platforms";
import {
  isDmAccessMissing,
  type ProviderComment,
  type ProviderConversation,
  type SocialProvider,
} from "@/lib/social/types";
import { isPlatformPaused } from "@/lib/social/zernio";
import type { ServiceClient } from "@/lib/supabase/service";
import { SORT_CAP } from "./reveal-data";
import {
  addTally,
  commentResponse,
  conversationResponse,
  emptyTally,
  type ResponseTally,
} from "./response-score";
import {
  catchUpAccountKeys,
  isGiveawayPost,
  needsReply,
  readBudget,
  underSortCap,
} from "./reveal-rules";
import {
  catchUpWindows,
  commentToDraft,
  DM_RESWEEP_AFTER_MS,
  firstStage,
  nextStage,
  pulledDmKey,
  pullsPastDms,
  sortConversation,
  type CatchUpStage,
} from "./rules";

// The first-connect catch-up job, run by /api/jobs/process (and kicked at once on connect through
// /api/jobs/catch-up, kick.ts). Each run does a bounded slice (a few accounts, stops when time's
// up), saves where it got to (post by post), and picks up there next time. Every insert is
// deduplicated (comment id; Meta's message id for DMs), so a rerun creates nothing twice.
//
// First connect engine (20 Nov): at most MAX_POSTS_READ posts and MAX_COMMENTS_READ comments are
// read; praise, friend tags and giveaway posts are counted, not sorted; only the first SORT_CAP
// found (newest posts first) go into the pipeline for Jev to sort, the rest are counted (over_cap,
// capped). The reveal's drafts are picked afterwards by finish.ts.

interface Deps {
  db: ServiceClient;
  social: () => SocialProvider;
  now?: Date;
  shouldContinue?: () => boolean;
}

/** A run holding a catch-up longer than this is assumed dead; another may take it. */
const LOCK_MS = 2 * 60 * 1000;
/** Give up on a catch-up that keeps failing (the owner still has webhooks from now on). */
const MAX_ATTEMPTS = 5;
const POSTS_PAGE = 25;
const COMMENTS_PAGE = 50;
/** Comment pages read per post: a viral post can't eat the whole run. */
const MAX_COMMENT_PAGES = 10;
const CONVERSATIONS = 100;
const MESSAGES_PER_CONVERSATION = 50;
/** A post's caption is kept this long on its pulled comments (labels and top questions). */
const POST_CAPTION_MAX = 300;

/**
 * Asks for a catch-up of a newly connected account. Returns false when the platform has nothing
 * to pull, or the real account (platform + handle, or Zernio's account id) already had one: only
 * one per account, ever, even after its Waggle row was deleted and connected again (20 Nov), so
 * the AI work is never repeated. A reconnect keeps the 24-hour backfill.
 */
export async function startCatchUp(
  db: ServiceClient,
  input: {
    tenantId: string;
    socialAccountId: string;
    platform: string;
    zernioAccountId: string;
    username: string | null;
  },
): Promise<boolean> {
  const stage = firstStage({
    comments: hasLiveComments(input.platform),
    dms: pullsPastDms(input.platform),
  });
  if (!stage) return false;
  const keys = catchUpAccountKeys(input);
  const [byKey, byId, byRow] = await Promise.all([
    db.from("catch_ups").select("id").in("account_key", keys.all).limit(1),
    db
      .from("catch_ups")
      .select("id")
      .eq("zernio_account_id", input.zernioAccountId)
      .eq("platform", input.platform)
      .limit(1),
    db.from("catch_ups").select("id").eq("social_account_id", input.socialAccountId).limit(1),
  ]);
  for (const r of [byKey, byId, byRow]) {
    if (r.error) throw new Error(`catch_ups lookup failed: ${r.error.message}`);
  }
  // This Waggle row already has one (a repeated connect event): it is running.
  if ((byRow.data ?? []).length > 0) return true;
  // The same real account had one before (deleted and connected again): never twice.
  if ((byKey.data ?? []).length > 0 || (byId.data ?? []).length > 0) return false;

  const { data, error } = await db
    .from("catch_ups")
    .insert({
      tenant_id: input.tenantId,
      social_account_id: input.socialAccountId,
      stage,
      platform: input.platform,
      account_key: keys.primary,
      zernio_account_id: input.zernioAccountId,
      handle: input.username,
    })
    .select("id");
  // A concurrent connect of the same account already started it.
  if (error?.code === "23505") return true;
  if (error) throw new Error(`catch_ups insert failed: ${error.message}`);
  await writeAudit(db, {
    tenantId: input.tenantId,
    action: "catch_up_started",
    actor: "system",
    details: {
      accountId: input.socialAccountId,
      platform: input.platform,
      catchUpId: data[0]?.id ?? null,
    },
  });
  return true;
}

type CatchUpRow = {
  id: string;
  tenant_id: string;
  social_account_id: string | null;
  created_at: string;
  stage: string;
  attempts: number;
  posts_cursor: string | null;
  post_offset: number;
  dm_offset: number;
  comments_created: number;
  dms_created: number;
  posts_read: number;
  comments_read: number;
  comments_found: number;
  praise_and_tags: number;
  over_cap: number;
  capped: boolean;
  response_messages: number;
  response_answered: number;
};

const ROW_COLUMNS =
  "id, tenant_id, social_account_id, created_at, stage, attempts, posts_cursor, post_offset, dm_offset, comments_created, dms_created, posts_read, comments_read, comments_found, praise_and_tags, over_cap, capped, response_messages, response_answered";

type Account = {
  id: string;
  tenant_id: string;
  zernio_account_id: string;
  platform: string;
  status: string;
};

export async function runCatchUps(
  deps: Deps,
  opts: { tenantId?: string; limit?: number } = {},
): Promise<{ runs: number; comments: number; dms: number; missed: number; finished: number }> {
  const { db } = deps;
  const now = deps.now ?? new Date();
  const summary = { runs: 0, comments: 0, dms: 0, missed: 0, finished: 0 };
  if (await getPlatformPause(db)) return summary;

  let query = db
    .from("catch_ups")
    .select(ROW_COLUMNS)
    .neq("stage", "done")
    .lte("next_run_at", now.toISOString())
    .or(`locked_at.is.null,locked_at.lt.${new Date(now.getTime() - LOCK_MS).toISOString()}`)
    .order("next_run_at", { ascending: true })
    .limit(opts.limit ?? 3);
  if (opts.tenantId) query = query.eq("tenant_id", opts.tenantId);
  const { data: due, error } = await query;
  if (error) throw new Error(`catch_ups lookup failed: ${error.message}`);

  for (const row of (due ?? []) as CatchUpRow[]) {
    if (deps.shouldContinue && !deps.shouldContinue()) break;
    // Claim it, so an overlapping run leaves it alone.
    const { data: claimed } = await db
      .from("catch_ups")
      .update({ locked_at: now.toISOString() })
      .eq("id", row.id)
      .neq("stage", "done")
      .or(`locked_at.is.null,locked_at.lt.${new Date(now.getTime() - LOCK_MS).toISOString()}`)
      .select("id");
    if (!claimed?.length) continue;

    if (!row.social_account_id) {
      // The account was deleted from Waggle: nothing left to read.
      await save(db, row.id, {
        stage: "done",
        finished_at: now.toISOString(),
        read_at: now.toISOString(),
      });
      continue;
    }
    const { data: account } = await db
      .from("social_accounts")
      .select("id, tenant_id, zernio_account_id, platform, status")
      .eq("id", row.social_account_id)
      .maybeSingle();
    if (!account || account.status !== "active") {
      // Waits for the account to come back (it keeps its 30-day windows).
      await save(db, row.id, { next_run_at: later(now, 10 * 60_000) });
      continue;
    }

    summary.runs += 1;
    try {
      const done = await runStages(deps, row, account, now, summary);
      if (done) summary.finished += 1;
    } catch (err) {
      if (isPlatformPaused(err)) {
        await recordPlatformPause(db, now);
        await save(db, row.id, {});
        break;
      }
      Sentry.captureException(err, { extra: { catchUpId: row.id } });
      const attempts = row.attempts + 1;
      if (attempts >= MAX_ATTEMPTS) {
        await finish(db, row, account, now, "gave_up");
      } else {
        await save(db, row.id, { attempts, next_run_at: later(now, attempts * 5 * 60_000) });
      }
    }
  }
  return summary;
}

/** Runs the account's stages until done or out of time. True when the catch-up finished. */
async function runStages(
  deps: Deps,
  row: CatchUpRow,
  account: Account,
  now: Date,
  summary: { comments: number; dms: number; missed: number },
): Promise<boolean> {
  const { db } = deps;
  const windows = catchUpWindows(new Date(row.created_at));
  const dms = pullsPastDms(account.platform);
  const more = () => !deps.shouldContinue || deps.shouldContinue();
  let stage = row.stage as CatchUpStage;

  while (stage !== "done") {
    let finished: boolean;
    if (stage === "comments") {
      finished = await pullComments(deps, row, account, windows, summary, more);
    } else {
      finished = await pullDms(deps, row, account, now, windows.dmsSince, summary, more);
    }
    if (!finished) {
      await save(db, row.id, { next_run_at: now.toISOString() });
      return false;
    }
    const from = stage;
    stage = nextStage(stage, dms);
    // Reading is over once the first DM sweep (or, without DMs, the comments) is done: the
    // reveal's sorting starts; the re-sweep only adds late replays.
    if (from !== "dms_again") {
      if (stage === "dms_again" || stage === "done") {
        await save(db, row.id, { read_at: now.toISOString() }, { keepLock: true });
      }
    }
    if (stage === "done") break;
    row.stage = stage;
    row.posts_cursor = null;
    row.post_offset = 0;
    row.dm_offset = 0;
    if (stage === "dms_again") {
      // Zernio's replay of past DMs may still be running: look once more in a few minutes.
      await save(db, row.id, {
        stage,
        dm_offset: 0,
        next_run_at: later(now, DM_RESWEEP_AFTER_MS),
      });
      return false;
    }
    await save(
      db,
      row.id,
      { stage, posts_cursor: null, post_offset: 0, dm_offset: 0 },
      { keepLock: true },
    );
  }
  await finish(db, row, account, now, "done");
  return true;
}

async function pullComments(
  deps: Deps,
  row: CatchUpRow,
  account: Account,
  windows: { postsSince: Date; commentsSince: Date },
  summary: { comments: number },
  more: () => boolean,
): Promise<boolean> {
  const { db } = deps;
  for (;;) {
    if (!more()) return false;
    if (!readBudget({ postsRead: row.posts_read, commentsRead: row.comments_read }).morePosts) {
      // The read caps were reached with posts left: they aren't read (the reveal says "500+").
      if (row.posts_cursor !== null || row.post_offset > 0) await markCapped(db, row);
      return true;
    }
    const page = await deps.social().listCommentedPostsPage({
      accountId: account.zernio_account_id,
      since: windows.postsSince,
      cursor: row.posts_cursor,
      limit: POSTS_PAGE,
    });
    const captions = new Map((page.posts ?? []).map((p) => [p.id, p.caption]));
    for (let i = row.post_offset; i < page.postIds.length; i += 1) {
      if (!more()) return false;
      const budget = readBudget({ postsRead: row.posts_read, commentsRead: row.comments_read });
      if (!budget.morePosts) {
        await markCapped(db, row);
        return true;
      }
      const postId = page.postIds[i];
      const post = await pullPost(deps, row, account, {
        postId,
        caption: captions.get(postId) ?? null,
        since: windows.commentsSince,
        commentsLeft: budget.commentsLeft,
      });
      // The post is done: its counts and where the next post starts, together.
      row.post_offset = i + 1;
      row.posts_read += 1;
      row.comments_read += post.read;
      row.comments_found += post.found;
      row.praise_and_tags += post.praise;
      row.over_cap += post.overCap;
      row.comments_created += post.created;
      row.capped = row.capped || post.capped;
      row.response_messages += post.response.messages;
      row.response_answered += post.response.answered;
      summary.comments += post.created;
      await save(
        db,
        row.id,
        {
          post_offset: row.post_offset,
          posts_read: row.posts_read,
          comments_read: row.comments_read,
          comments_found: row.comments_found,
          praise_and_tags: row.praise_and_tags,
          over_cap: row.over_cap,
          comments_created: row.comments_created,
          capped: row.capped,
          response_messages: row.response_messages,
          response_answered: row.response_answered,
        },
        { keepLock: true },
      );
    }
    // The page is done: the next page starts at its first post.
    row.posts_cursor = page.nextCursor;
    row.post_offset = 0;
    await save(db, row.id, { posts_cursor: row.posts_cursor, post_offset: 0 }, { keepLock: true });
    if (!row.posts_cursor) return true;
  }
}

/**
 * One post's comments: read them (within the comment budget), decide which need a reply, and put
 * those into the pipeline while under the sort cap. A giveaway post (most comments only tag
 * friends) is counted as praise and tags as a whole.
 */
async function pullPost(
  deps: Deps,
  row: CatchUpRow,
  account: Account,
  input: { postId: string; caption: string | null; since: Date; commentsLeft: number },
): Promise<{
  read: number;
  found: number;
  praise: number;
  overCap: number;
  created: number;
  capped: boolean;
  /** Response score: customer comments judged, and answered within 24 hours. */
  response: ResponseTally;
}> {
  const all: ProviderComment[] = [];
  let cursor: string | null = null;
  let capped = false;
  for (let p = 0; p < MAX_COMMENT_PAGES; p += 1) {
    const left = input.commentsLeft - all.length;
    if (left <= 0) {
      capped = true;
      break;
    }
    const comments: { comments: ProviderComment[]; nextCursor: string | null } = await deps
      .social()
      .listPostCommentsPage({
        accountId: account.zernio_account_id,
        postId: input.postId,
        cursor,
        limit: Math.min(COMMENTS_PAGE, left),
      });
    all.push(...comments.comments);
    cursor = comments.nextCursor;
    if (!cursor) break;
  }

  const giveaway = isGiveawayPost(all.filter((c) => !c.fromOwner).map((c) => c.text));
  const result = {
    read: all.length,
    found: 0,
    praise: 0,
    overCap: 0,
    created: 0,
    capped,
    response: emptyTally(),
  };
  const now = deps.now ?? new Date();
  for (const c of all) {
    // Response score: comments that needed a reply, answered by the business or not.
    if (!giveaway && needsReply(c.text)) {
      const judged = commentResponse(c, input.since, now);
      if (judged) {
        result.response.messages += 1;
        if (judged === "answered") result.response.answered += 1;
      }
    }
    if (!commentToDraft(c, input.since)) continue;
    result.found += 1;
    if (giveaway || !needsReply(c.text)) {
      result.praise += 1;
      continue;
    }
    if (!underSortCap(row.comments_created + row.dms_created + result.created, SORT_CAP)) {
      result.overCap += 1;
      result.capped = true;
      continue;
    }
    const inserted = await insertInboundItem(deps.db, {
      kind: "comment",
      tenantId: account.tenant_id,
      socialAccountId: account.id,
      zernioCommentId: c.id,
      zernioPostId: input.postId,
      authorName: c.authorName,
      text: c.text,
      receivedAt: c.createdAt!,
      catchUpId: row.id,
      postCaption: input.caption?.slice(0, POST_CAPTION_MAX) ?? null,
    });
    if (inserted.created) result.created += 1;
  }
  return result;
}

async function markCapped(db: ServiceClient, row: CatchUpRow): Promise<void> {
  if (row.capped) return;
  row.capped = true;
  await save(db, row.id, { capped: true }, { keepLock: true });
}

async function pullDms(
  deps: Deps,
  row: CatchUpRow,
  account: Account,
  now: Date,
  since: Date,
  summary: { dms: number; missed: number },
  more: () => boolean,
): Promise<boolean> {
  const { db } = deps;
  let listed: ProviderConversation[];
  try {
    listed = await deps
      .social()
      .listConversations({ accountId: account.zernio_account_id, limit: CONVERSATIONS });
  } catch (err) {
    // 20 Nov: Zernio couldn't read this account's messages (Instagram's message access is off,
    // or the permission wasn't granted). Comments still count; the reveal says DMs are missing.
    if (!isDmAccessMissing(err)) throw err;
    await save(db, row.id, { dm_access_missing: true }, { keepLock: true });
    return true;
  }
  const conversations = listed.filter(
    (c) => !c.updatedTime || Date.parse(c.updatedTime) >= since.getTime(),
  );

  // Response score: DMs are judged on the first sweep only (the re-sweep reads them again).
  const judge = row.stage === "dms";
  for (let i = row.dm_offset; i < conversations.length; i += 1) {
    if (!more()) return false;
    const { created, missed, response } = await pullConversation(
      deps,
      row,
      account,
      conversations[i],
      now,
      since,
    );
    row.dm_offset = i + 1;
    row.dms_created += created;
    if (judge) {
      const total = addTally(
        { messages: row.response_messages, answered: row.response_answered },
        response,
      );
      row.response_messages = total.messages;
      row.response_answered = total.answered;
    }
    summary.dms += created;
    summary.missed += missed;
    await save(
      db,
      row.id,
      {
        dm_offset: row.dm_offset,
        dms_created: row.dms_created,
        ...(judge
          ? {
              response_messages: row.response_messages,
              response_answered: row.response_answered,
            }
          : {}),
      },
      { keepLock: true },
    );
  }
  return true;
}

async function pullConversation(
  deps: Deps,
  row: CatchUpRow,
  account: Account,
  conversation: ProviderConversation,
  now: Date,
  since: Date,
): Promise<{ created: number; missed: number; response: ResponseTally }> {
  const { db } = deps;
  const messages = await deps.social().listConversationMessages({
    conversationId: conversation.id,
    accountId: account.zernio_account_id,
    limit: MESSAGES_PER_CONVERSATION,
  });
  const { draft, missed } = sortConversation(messages, now, since);
  const response = conversationResponse(messages, since, now);

  let created = 0;
  if (draft.length > 0) {
    const name = conversation.participantName ?? draft[0].senderName ?? null;
    const recorded = await recordConversation(db, {
      tenantId: account.tenant_id,
      socialAccountId: account.id,
      zernioConversationId: conversation.id,
      platform: account.platform,
      participantName: name,
      participantExternalId: conversation.participantId,
      customerMessageAt: draft[0].createdAt,
    });
    if ("foreign" in recorded) return { created: 0, missed: 0, response: emptyTally() };
    // Oldest first, the order webhooks would have brought them in. DMs inside the 24-hour window
    // are always sorted (few, and the ones about to expire): the sort cap is for comments.
    for (const m of [...draft].reverse()) {
      const result = await insertInboundItem(db, {
        kind: "dm",
        tenantId: account.tenant_id,
        socialAccountId: account.id,
        zernioMessageId: pulledDmKey(m.id),
        conversationId: recorded.conversationId,
        platformMessageId: m.id,
        authorName: name,
        text: m.text ?? "",
        receivedAt: m.createdAt,
        catchUpId: row.id,
      });
      if (result.created) created += 1;
    }
  }

  let added = 0;
  if (missed.length > 0) {
    // Never show as missed what is already an item (e.g. drafted on the first sweep).
    const { data: items } = await db
      .from("inbound_items")
      .select("platform_message_id")
      .eq("social_account_id", account.id)
      .in(
        "platform_message_id",
        missed.map((m) => m.id),
      );
    const known = new Set((items ?? []).map((r) => r.platform_message_id));
    const rows = missed
      .filter((m) => !known.has(m.id))
      .map((m) => ({
        tenant_id: account.tenant_id,
        social_account_id: account.id,
        zernio_conversation_id: conversation.id,
        platform_message_id: m.id,
        sender_name: conversation.participantName ?? m.senderName ?? null,
        text: m.text ?? "",
        received_at: m.createdAt,
      }));
    if (rows.length > 0) {
      const { data, error } = await db
        .from("missed_messages")
        .upsert(rows, {
          onConflict: "social_account_id,platform_message_id",
          ignoreDuplicates: true,
        })
        .select("id");
      if (error) throw new Error(`missed_messages insert failed: ${error.message}`);
      added = data.length;
    }
  }
  return { created, missed: added, response };
}

async function finish(
  db: ServiceClient,
  row: CatchUpRow,
  account: Account,
  now: Date,
  outcome: "done" | "gave_up",
): Promise<void> {
  // A catch-up that gave up mid-read still gets its reveal from what it read.
  await save(db, row.id, {
    stage: "done",
    finished_at: now.toISOString(),
    ...(outcome === "gave_up" ? { read_at: now.toISOString() } : {}),
  });
  const { count } = await db
    .from("missed_messages")
    .select("id", { count: "exact", head: true })
    .eq("social_account_id", account.id);
  await writeAudit(db, {
    tenantId: account.tenant_id,
    action: "catch_up_finished",
    actor: "system",
    details: {
      accountId: account.id,
      outcome,
      comments: row.comments_created,
      dms: row.dms_created,
      missed: count ?? 0,
      postsRead: row.posts_read,
      commentsRead: row.comments_read,
      praiseAndTags: row.praise_and_tags,
      overCap: row.over_cap,
    },
  });
}

/** Saves progress and lets go of the claim (unless the run carries on with it). */
async function save(
  db: ServiceClient,
  id: string,
  patch: {
    stage?: CatchUpStage;
    posts_cursor?: string | null;
    post_offset?: number;
    dm_offset?: number;
    comments_created?: number;
    dms_created?: number;
    attempts?: number;
    next_run_at?: string;
    finished_at?: string;
    posts_read?: number;
    comments_read?: number;
    comments_found?: number;
    praise_and_tags?: number;
    over_cap?: number;
    capped?: boolean;
    dm_access_missing?: boolean;
    read_at?: string;
    response_messages?: number;
    response_answered?: number;
  },
  opts: { keepLock?: boolean } = {},
): Promise<void> {
  const { error } = await db
    .from("catch_ups")
    .update(opts.keepLock ? patch : { ...patch, locked_at: null })
    .eq("id", id);
  if (error) throw new Error(`catch_ups update failed: ${error.message}`);
}

const later = (now: Date, ms: number) => new Date(now.getTime() + ms).toISOString();
