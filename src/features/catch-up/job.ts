import * as Sentry from "@sentry/nextjs";
import { insertInboundItem, recordConversation } from "@/features/inbox";
import { writeAudit } from "@/lib/audit";
import { getPlatformPause, recordPlatformPause } from "@/lib/social/platform-pause";
import { hasLiveComments } from "@/lib/social/platforms";
import type { ProviderConversation, SocialProvider } from "@/lib/social/types";
import { isPlatformPaused } from "@/lib/social/zernio";
import type { ServiceClient } from "@/lib/supabase/service";
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

// The first-connect catch-up job, run by /api/jobs/process. Each run does a bounded slice (a few
// accounts, stops when time's up), saves where it got to, and picks up there next minute. Every
// insert is deduplicated (comment id; Meta's message id for DMs), so a rerun creates nothing twice.

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

/**
 * Asks for a catch-up of a newly connected account. Returns false when the platform has nothing
 * to pull. Only one per account, ever: a reconnect keeps the 24-hour backfill.
 */
export async function startCatchUp(
  db: ServiceClient,
  input: { tenantId: string; socialAccountId: string; platform: string },
): Promise<boolean> {
  const stage = firstStage({
    comments: hasLiveComments(input.platform),
    dms: pullsPastDms(input.platform),
  });
  if (!stage) return false;
  const { data, error } = await db
    .from("catch_ups")
    .upsert(
      { tenant_id: input.tenantId, social_account_id: input.socialAccountId, stage },
      { onConflict: "social_account_id", ignoreDuplicates: true },
    )
    .select("id");
  if (error) throw new Error(`catch_ups insert failed: ${error.message}`);
  if (data.length > 0) {
    await writeAudit(db, {
      tenantId: input.tenantId,
      action: "catch_up_started",
      actor: "system",
      details: { accountId: input.socialAccountId, platform: input.platform },
    });
  }
  return true;
}

type CatchUpRow = {
  id: string;
  tenant_id: string;
  social_account_id: string;
  created_at: string;
  stage: string;
  attempts: number;
  posts_cursor: string | null;
  dm_offset: number;
  comments_created: number;
  dms_created: number;
};

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
    .select(
      "id, tenant_id, social_account_id, created_at, stage, attempts, posts_cursor, dm_offset, comments_created, dms_created",
    )
    .neq("stage", "done")
    .lte("next_run_at", now.toISOString())
    .or(`locked_at.is.null,locked_at.lt.${new Date(now.getTime() - LOCK_MS).toISOString()}`)
    .order("next_run_at", { ascending: true })
    .limit(opts.limit ?? 3);
  if (opts.tenantId) query = query.eq("tenant_id", opts.tenantId);
  const { data: due, error } = await query;
  if (error) throw new Error(`catch_ups lookup failed: ${error.message}`);

  for (const row of due ?? []) {
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
    stage = nextStage(stage, dms);
    if (stage === "done") break;
    row.stage = stage;
    row.posts_cursor = null;
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
    await save(db, row.id, { stage, posts_cursor: null, dm_offset: 0 }, { keepLock: true });
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
  let cursor = row.posts_cursor;
  do {
    if (!more()) return false;
    const page = await deps.social().listCommentedPostsPage({
      accountId: account.zernio_account_id,
      since: windows.postsSince,
      cursor,
      limit: POSTS_PAGE,
    });
    let created = 0;
    for (const postId of page.postIds) {
      let commentsCursor: string | null = null;
      for (let p = 0; p < MAX_COMMENT_PAGES; p += 1) {
        const comments = await deps.social().listPostCommentsPage({
          accountId: account.zernio_account_id,
          postId,
          cursor: commentsCursor,
          limit: COMMENTS_PAGE,
        });
        for (const c of comments.comments) {
          if (!commentToDraft(c, windows.commentsSince)) continue;
          const result = await insertInboundItem(db, {
            kind: "comment",
            tenantId: account.tenant_id,
            socialAccountId: account.id,
            zernioCommentId: c.id,
            zernioPostId: postId,
            authorName: c.authorName,
            text: c.text,
            receivedAt: c.createdAt!,
          });
          if (result.created) created += 1;
        }
        commentsCursor = comments.nextCursor;
        if (!commentsCursor) break;
      }
    }
    // The page is done: save the counts and where the next page starts, together.
    cursor = page.nextCursor;
    row.comments_created += created;
    row.posts_cursor = cursor;
    summary.comments += created;
    await save(
      db,
      row.id,
      { posts_cursor: cursor, comments_created: row.comments_created },
      { keepLock: true },
    );
  } while (cursor);
  return true;
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
  const conversations = (
    await deps
      .social()
      .listConversations({ accountId: account.zernio_account_id, limit: CONVERSATIONS })
  ).filter((c) => !c.updatedTime || Date.parse(c.updatedTime) >= since.getTime());

  for (let i = row.dm_offset; i < conversations.length; i += 1) {
    if (!more()) return false;
    const { created, missed } = await pullConversation(deps, account, conversations[i], now, since);
    row.dm_offset = i + 1;
    row.dms_created += created;
    summary.dms += created;
    summary.missed += missed;
    await save(
      db,
      row.id,
      { dm_offset: row.dm_offset, dms_created: row.dms_created },
      { keepLock: true },
    );
  }
  return true;
}

async function pullConversation(
  deps: Deps,
  account: Account,
  conversation: ProviderConversation,
  now: Date,
  since: Date,
): Promise<{ created: number; missed: number }> {
  const { db } = deps;
  const messages = await deps.social().listConversationMessages({
    conversationId: conversation.id,
    accountId: account.zernio_account_id,
    limit: MESSAGES_PER_CONVERSATION,
  });
  const { draft, missed } = sortConversation(messages, now, since);

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
    if ("foreign" in recorded) return { created: 0, missed: 0 };
    // Oldest first, the order webhooks would have brought them in.
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
  return { created, missed: added };
}

async function finish(
  db: ServiceClient,
  row: CatchUpRow,
  account: Account,
  now: Date,
  outcome: "done" | "gave_up",
): Promise<void> {
  await save(db, row.id, { stage: "done", finished_at: now.toISOString() });
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
    dm_offset?: number;
    comments_created?: number;
    dms_created?: number;
    attempts?: number;
    next_run_at?: string;
    finished_at?: string;
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
