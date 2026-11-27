import * as Sentry from "@sentry/nextjs";
import { isGiveawayPost, pulledDmKey, readPostComments } from "@/features/catch-up";
import { insertInboundItem, recordConversation, senderKeyFor } from "@/features/inbox";
import { groupGaps, loadGaps } from "@/features/knowledge-base";
import { setupTopic } from "@/features/setup";
import { writeAudit } from "@/lib/audit";
import { businessContext } from "@/lib/classifier/business-context";
import type { Classifier } from "@/lib/classifier/types";
import { loadTenantAiSpend } from "@/lib/llm/spend";
import { getPlatformPause, recordPlatformPause } from "@/lib/social/platform-pause";
import { platformLabel } from "@/lib/social/platforms";
import {
  isDmAccessMissing,
  type ProviderComment,
  type ProviderConversation,
  type SocialProvider,
} from "@/lib/social/types";
import { isPlatformPaused } from "@/lib/social/zernio";
import type { Json } from "@/lib/supabase/database.types";
import type { ServiceClient } from "@/lib/supabase/service";
import { businessZoneOf } from "./data";
import { replyWindowMs, weeklyReads } from "./reads";
import { businessZone, checkNowOpen, checkNowWindow, endOfLocalDay, mondayRun } from "./schedule";
import { knownMessages, sortWeekComment, sortWeekConversation, type WeekOutcome } from "./select";
import {
  addOutcome,
  buildWeekSummary,
  emptyTally,
  type AccountTally,
  type WeekAccount,
  type WeekItemRow,
  type WeekTopic,
} from "./summary";

// Weekly check-up (board "Your week", approved 26 Nov). Runs from /api/jobs/process (every minute:
// Monday runs are queued at 7:00 AM business time, then read a slice at a time) and from
// /api/jobs/weekly (kicked by Check now, so the button moves within seconds).
//
// One run reads every connected account of a business over its week: comments where the platform
// has them, DMs where Zernio lists conversations (reads.ts). Every message is matched against what
// Waggle already has (select.ts): only messages Waggle never saw go into the Inbox, through the
// ordinary insert, and get one draft from the ordinary steps (the one-reply-per-sender rule
// included). Nothing here drafts, sends or changes an item's status. Ids and counts only in logs
// and in the stored tally (CLAUDE.md rule 10).

export interface WeeklyDeps {
  db: ServiceClient;
  social: () => SocialProvider;
  /** Sorts counted-only messages for "What people wanted" (capped); none: words only. */
  classifier?: Classifier | null;
  now?: Date;
  shouldContinue?: () => boolean;
}

/** A run holding its lock longer than this is assumed dead; another may take it. */
const LOCK_MS = 2 * 60 * 1000;
/** A run that keeps failing as a whole gives up (each account's own failure is only noted). */
const MAX_ATTEMPTS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Posts are listed by when they were made: a comment this week can be on an older post. */
const POSTS_SINCE_MS = 30 * DAY_MS;
const POSTS_PAGE = 25;
/** Posts with comments read per account per run. */
const MAX_POSTS = 30;
/** Comments read per post. */
const MAX_COMMENTS_PER_POST = 200;
/** Zernio gives one page of up to 100 conversations. */
const CONVERSATIONS = 100;
const MESSAGES_PER_CONVERSATION = 50;
/** AI sorts of counted-only messages per run ("What people wanted"); the rest go by their words. */
export const RUN_SORT_CAP = 30;
const SORT_TIMEOUT_MS = 15_000;
/** Items read to build the summary. */
const SUMMARY_ITEMS_MAX = 5000;
const POST_CAPTION_MAX = 300;
/** Ids looked up per query. */
const ID_CHUNK = 200;

type AccountRow = {
  id: string;
  tenant_id: string;
  zernio_account_id: string;
  platform: string;
  status: string;
  username: string | null;
};

type RunRow = {
  id: string;
  tenant_id: string;
  trigger: string;
  status: string;
  window_start: string;
  window_end: string;
  started_at: string | null;
  attempts: number;
  accounts: Json;
  tally: Json;
};

/** Each account's place in the run. */
type RunAccount = WeekAccount & { done: boolean };

const RUN_COLUMNS =
  "id, tenant_id, trigger, status, window_start, window_end, started_at, attempts, accounts, tally";

// ---------------------------------------------------------------------------------------------
// Starting runs.

/**
 * Queues this week's Monday check-up for every business it's due for (Monday, 7:00 AM or later,
 * business time) that doesn't have one. A business that is already checking (Check now) is
 * skipped this minute and queued on a later one.
 */
export async function scheduleMondayChecks(
  db: ServiceClient,
  now = new Date(),
): Promise<{ queued: number }> {
  const { data: active, error } = await db
    .from("social_accounts")
    .select("tenant_id, tenants!inner (organization_id, offboarded_at)")
    .eq("status", "active")
    .is("tenants.offboarded_at", null)
    .limit(5000);
  if (error) throw new Error(`weekly: accounts lookup failed: ${error.message}`);
  const orgOf = new Map<string, string | null>();
  for (const r of active ?? []) orgOf.set(r.tenant_id, r.tenants.organization_id);
  if (orgOf.size === 0) return { queued: 0 };

  const orgIds = [...new Set([...orgOf.values()].filter((o): o is string => !!o))];
  const zones = new Map<string, string | null>();
  for (let i = 0; i < orgIds.length; i += ID_CHUNK) {
    const { data } = await db
      .from("org_billing")
      .select("organization_id, time_zone")
      .in("organization_id", orgIds.slice(i, i + ID_CHUNK));
    for (const b of data ?? []) zones.set(b.organization_id, b.time_zone);
  }

  const due: { tenantId: string; run: ReturnType<typeof mondayRun> }[] = [];
  for (const [tenantId, org] of orgOf) {
    const run = mondayRun(now, businessZone(org ? (zones.get(org) ?? null) : null));
    if (run.due) due.push({ tenantId, run });
  }
  if (due.length === 0) return { queued: 0 };

  const have = new Set<string>();
  for (let i = 0; i < due.length; i += ID_CHUNK) {
    const chunk = due.slice(i, i + ID_CHUNK);
    const { data, error: e } = await db
      .from("weekly_checks")
      .select("tenant_id, week_start")
      .eq("trigger", "monday")
      .in(
        "tenant_id",
        chunk.map((d) => d.tenantId),
      )
      .in("week_start", [...new Set(chunk.map((d) => d.run.weekStart))]);
    if (e) throw new Error(`weekly: runs lookup failed: ${e.message}`);
    for (const r of data ?? []) have.add(`${r.tenant_id}:${r.week_start}`);
  }

  let queued = 0;
  for (const d of due) {
    if (have.has(`${d.tenantId}:${d.run.weekStart}`)) continue;
    const { error: insertError } = await db.from("weekly_checks").insert({
      tenant_id: d.tenantId,
      trigger: "monday",
      week_start: d.run.weekStart,
      window_start: d.run.from.toISOString(),
      window_end: d.run.to.toISOString(),
    });
    // Already queued, or Check now is running for this business: a later minute takes it.
    if (insertError?.code === "23505") continue;
    if (insertError) throw new Error(`weekly: queueing failed: ${insertError.message}`);
    queued += 1;
  }
  return { queued };
}

export type CheckNowResult =
  | { outcome: "started"; runId: string }
  | { outcome: "running"; runId: string | null }
  | { outcome: "used"; at: string };

/** The owner's Check now: once a day per business, never while a check-up is running. */
export async function requestCheckNow(
  db: ServiceClient,
  input: { tenantId: string; userId: string; now?: Date },
): Promise<CheckNowResult> {
  const now = input.now ?? new Date();
  const running = async () => {
    const { data } = await db
      .from("weekly_checks")
      .select("id")
      .eq("tenant_id", input.tenantId)
      .in("status", ["queued", "running"])
      .maybeSingle();
    return data?.id ?? null;
  };
  const active = await running();
  if (active) return { outcome: "running", runId: active };

  const { data: last, error } = await db
    .from("weekly_checks")
    .select("created_at")
    .eq("tenant_id", input.tenantId)
    .eq("trigger", "check_now")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`weekly: last check lookup failed: ${error.message}`);
  const zone = await businessZoneOf(db, input.tenantId);
  if (last && !checkNowOpen(new Date(last.created_at), now, zone)) {
    return { outcome: "used", at: last.created_at };
  }

  const window = checkNowWindow(now);
  const { data: row, error: insertError } = await db
    .from("weekly_checks")
    .insert({
      tenant_id: input.tenantId,
      trigger: "check_now",
      window_start: window.from.toISOString(),
      window_end: window.to.toISOString(),
      requested_by: input.userId,
    })
    .select("id")
    .single();
  // The Monday check-up (or another click) started a moment ago.
  if (insertError?.code === "23505") return { outcome: "running", runId: await running() };
  if (insertError) throw new Error(`weekly: check now failed: ${insertError.message}`);
  await writeAudit(db, {
    tenantId: input.tenantId,
    action: "weekly_check_now_requested",
    actor: input.userId,
    details: { runId: row.id },
  });
  return { outcome: "started", runId: row.id };
}

// ---------------------------------------------------------------------------------------------
// Running.

const parseAccounts = (raw: Json): RunAccount[] =>
  Array.isArray(raw) ? (raw as unknown as RunAccount[]) : [];
const parseTally = (raw: Json): Record<string, AccountTally> =>
  raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as unknown as Record<string, AccountTally>)
    : {};

function accountName(a: AccountRow): string {
  const name = (a.username ?? "").trim().replace(/^@/, "");
  if (!name) return platformLabel(a.platform);
  return /\s/.test(name) ? name : `@${name}`;
}

export async function runWeeklyChecks(
  deps: WeeklyDeps,
  opts: { tenantId?: string; limit?: number } = {},
): Promise<{ runs: number; finished: number; found: number }> {
  const { db } = deps;
  const now = deps.now ?? new Date();
  const result = { runs: 0, finished: 0, found: 0 };
  if (await getPlatformPause(db)) return result;
  const stale = new Date(now.getTime() - LOCK_MS).toISOString();

  let query = db
    .from("weekly_checks")
    .select(RUN_COLUMNS)
    .in("status", ["queued", "running"])
    .or(`locked_at.is.null,locked_at.lt.${stale}`)
    .order("created_at", { ascending: true })
    .limit(opts.limit ?? 2);
  if (opts.tenantId) query = query.eq("tenant_id", opts.tenantId);
  const { data: due, error } = await query;
  if (error) throw new Error(`weekly: runs lookup failed: ${error.message}`);

  for (const row of (due ?? []) as RunRow[]) {
    if (deps.shouldContinue && !deps.shouldContinue()) break;
    const { data: claimed } = await db
      .from("weekly_checks")
      .update({
        locked_at: now.toISOString(),
        status: "running",
        ...(row.started_at ? {} : { started_at: now.toISOString() }),
      })
      .eq("id", row.id)
      .in("status", ["queued", "running"])
      .or(`locked_at.is.null,locked_at.lt.${stale}`)
      .select("id");
    if (!claimed?.length) continue;
    result.runs += 1;
    try {
      const outcome = await runOne(deps, row, now);
      result.found += outcome.found;
      if (outcome.finished) result.finished += 1;
    } catch (err) {
      if (isPlatformPaused(err)) {
        await recordPlatformPause(db, now);
        await db.from("weekly_checks").update({ locked_at: null }).eq("id", row.id);
        break;
      }
      Sentry.captureException(err, { extra: { weeklyCheckId: row.id } });
      const attempts = row.attempts + 1;
      await db
        .from("weekly_checks")
        .update(
          attempts >= MAX_ATTEMPTS
            ? { status: "failed", attempts, locked_at: null, finished_at: now.toISOString() }
            : { attempts, locked_at: null },
        )
        .eq("id", row.id);
      if (attempts >= MAX_ATTEMPTS) {
        await writeAudit(db, {
          tenantId: row.tenant_id,
          action: "weekly_check_finished",
          actor: "system",
          details: { runId: row.id, outcome: "failed" },
        });
      }
    }
  }
  return result;
}

interface RunContext {
  deps: WeeklyDeps;
  row: RunRow;
  now: Date;
  from: Date;
  to: Date;
  sort: (text: string, kind: "comment" | "dm") => Promise<WeekTopic>;
}

async function runOne(
  deps: WeeklyDeps,
  row: RunRow,
  now: Date,
): Promise<{ finished: boolean; found: number }> {
  const { db } = deps;
  let accounts = parseAccounts(row.accounts);
  const tally = parseTally(row.tally);

  if (accounts.length === 0) {
    const { data, error } = await db
      .from("social_accounts")
      .select("id, tenant_id, zernio_account_id, platform, status, username")
      .eq("tenant_id", row.tenant_id)
      .order("created_at");
    if (error) throw new Error(`weekly: accounts lookup failed: ${error.message}`);
    accounts = (data ?? []).map((a) => ({
      id: a.id,
      platform: a.platform,
      name: accountName(a),
      state: a.status === "active" ? "read" : "failed",
      reason: a.status === "active" ? null : "reconnect",
      done: a.status !== "active",
    }));
    await save(db, row.id, { accounts: accounts as unknown as Json });
    await writeAudit(db, {
      tenantId: row.tenant_id,
      action: "weekly_check_started",
      actor: "system",
      details: { runId: row.id, trigger: row.trigger, accounts: accounts.length },
    });
  }

  const ctx: RunContext = {
    deps,
    row,
    now,
    from: new Date(row.window_start),
    to: new Date(row.window_end),
    sort: await topicSorter(deps, row.tenant_id, now),
  };
  const more = () => !deps.shouldContinue || deps.shouldContinue();
  let found = 0;

  for (const account of accounts) {
    if (account.done) continue;
    if (!more()) {
      await save(db, row.id, { locked_at: null });
      return { finished: false, found };
    }
    const { data: live } = await db
      .from("social_accounts")
      .select("id, tenant_id, zernio_account_id, platform, status, username")
      .eq("id", account.id)
      .maybeSingle();
    let t = tally[account.id] ?? emptyTally();
    if (!live || live.status !== "active") {
      account.state = "failed";
      account.reason = "reconnect";
    } else {
      try {
        const read = await readAccount(ctx, live, t);
        t = read.tally;
        account.state = read.state;
        account.reason = read.reason;
      } catch (err) {
        if (isPlatformPaused(err)) throw err;
        // Ids only (rule 10). The rest of the business is still read.
        Sentry.captureException(err, { extra: { weeklyCheckId: row.id, accountId: account.id } });
        account.state = "failed";
        account.reason = "error";
      }
    }
    account.done = true;
    tally[account.id] = t;
    found += t.found;
    await save(db, row.id, {
      accounts: accounts as unknown as Json,
      tally: tally as unknown as Json,
    });
  }

  await finishRun(db, row, accounts, tally, now);
  return { finished: true, found };
}

/** Sorts a counted-only message's topic: AI within the run's cap and the business's AI cap. */
async function topicSorter(
  deps: WeeklyDeps,
  tenantId: string,
  now: Date,
): Promise<(text: string, kind: "comment" | "dm") => Promise<WeekTopic>> {
  const { db, classifier } = deps;
  let left = 0;
  let context: { text: string; name: string } | null = null;
  if (classifier) {
    try {
      const spend = await loadTenantAiSpend(db, tenantId, now);
      if (spend.level !== "reached") {
        const { data: tenant } = await db
          .from("tenants")
          .select("name, business_profile")
          .eq("id", tenantId)
          .single();
        if (tenant) {
          context = {
            text: businessContext({ name: tenant.name, profile: tenant.business_profile }).text,
            name: tenant.name.trim(),
          };
          left = RUN_SORT_CAP;
        }
      }
    } catch (err) {
      Sentry.captureException(err, { extra: { tenantId, step: "weekly-sort-setup" } });
    }
  }
  let sorted = 0;
  return async (text, kind) => {
    if (!classifier || !context || left <= 0) return setupTopic(text, null);
    left -= 1;
    try {
      const result = await classifier.classify(
        {
          tenantId,
          itemId: null,
          text,
          kind,
          businessContext: context.text,
          businessName: context.name,
        },
        { signal: AbortSignal.timeout(SORT_TIMEOUT_MS) },
      );
      sorted += 1;
      if (sorted === 1 || left === 0) {
        // Not one audit row per call: the first and the last of the run.
        await writeAudit(db, {
          tenantId,
          action: "weekly_check_sorted",
          actor: "system",
          details: { sorted },
        }).catch(() => undefined);
      }
      return setupTopic(text, result.category);
    } catch (err) {
      // A failed call stops the AI for this run; the rest go by their words.
      left = 0;
      Sentry.captureException(err, { extra: { tenantId, step: "weekly-sort" } });
      return setupTopic(text, null);
    }
  };
}

/** What can't be read on an account is said once, by name, on Today. */
async function readAccount(
  ctx: RunContext,
  account: AccountRow,
  start: AccountTally,
): Promise<{ tally: AccountTally; state: WeekAccount["state"]; reason: string | null }> {
  const reads = weeklyReads(account.platform);
  if (!reads.comments && !reads.dms) return { tally: start, state: "not_read", reason: null };
  let tally = start;
  let reason: string | null = null;
  if (reads.comments) tally = await readComments(ctx, account, tally);
  if (reads.dms) {
    const dms = await readDms(ctx, account, tally);
    tally = dms.tally;
    if (dms.accessMissing) reason = "dm_access";
  }
  return { tally, state: reason ? "partial" : "read", reason };
}

async function countOnly(
  ctx: RunContext,
  tally: AccountTally,
  outcome: WeekOutcome,
  text: string,
  kind: "comment" | "dm",
): Promise<AccountTally> {
  if (outcome === "known" || outcome === "insert") return addOutcome(tally, outcome, null);
  if (outcome === "no_reply_needed") return addOutcome(tally, outcome, null);
  return addOutcome(tally, outcome, await ctx.sort(text, kind));
}

async function readComments(
  ctx: RunContext,
  account: AccountRow,
  start: AccountTally,
): Promise<AccountTally> {
  const { db } = ctx.deps;
  const social = ctx.deps.social();
  const posts: { postId: string; caption: string | null; comments: ProviderComment[] }[] = [];
  let cursor: string | null = null;
  let read = 0;
  do {
    const page = await social.listCommentedPostsPage({
      accountId: account.zernio_account_id,
      since: new Date(ctx.from.getTime() - POSTS_SINCE_MS),
      cursor,
      limit: POSTS_PAGE,
    });
    const captions = new Map((page.posts ?? []).map((p) => [p.id, p.caption]));
    for (const postId of page.postIds) {
      if (read >= MAX_POSTS) break;
      read += 1;
      const { comments } = await readPostComments(social, {
        accountId: account.zernio_account_id,
        postId,
        limit: MAX_COMMENTS_PER_POST,
      });
      posts.push({ postId, caption: captions.get(postId) ?? null, comments });
    }
    cursor = page.nextCursor;
  } while (cursor && read < MAX_POSTS);

  // What Waggle already has, by the comments' own ids.
  const ids = posts.flatMap((p) => p.comments.map((c) => c.id));
  const knownIds: string[] = [];
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const { data, error } = await db
      .from("inbound_items")
      .select("zernio_comment_id")
      .eq("tenant_id", account.tenant_id)
      .in("zernio_comment_id", ids.slice(i, i + ID_CHUNK));
    if (error) throw new Error(`weekly: comments lookup failed: ${error.message}`);
    for (const r of data ?? []) if (r.zernio_comment_id) knownIds.push(r.zernio_comment_id);
  }
  const known = knownMessages({
    items: knownIds.map((id) => ({
      kind: "comment",
      zernio_comment_id: id,
      platform_message_id: null,
      zernio_message_id: null,
      received_at: ctx.from.toISOString(),
      zernio_conversation_id: null,
    })),
    missed: [],
  });

  let tally = start;
  for (const post of posts) {
    const giveaway = isGiveawayPost(post.comments.filter((c) => !c.fromOwner).map((c) => c.text));
    for (const c of post.comments) {
      let outcome = sortWeekComment(c, { known, from: ctx.from, to: ctx.to, giveaway });
      if (!outcome) continue;
      if (outcome === "insert") {
        const inserted = await insertInboundItem(db, {
          kind: "comment",
          tenantId: account.tenant_id,
          socialAccountId: account.id,
          zernioCommentId: c.id,
          zernioPostId: post.postId,
          authorName: c.authorName,
          text: c.text,
          receivedAt: c.createdAt!,
          postCaption: post.caption?.slice(0, POST_CAPTION_MAX) ?? null,
          senderKey: senderKeyFor({ kind: "comment", authorName: c.authorName }),
        });
        // Another copy (a webhook) landed first: it's Waggle's already.
        if (!inserted.created) outcome = "known";
      }
      tally = await countOnly(ctx, tally, outcome, c.text, "comment");
    }
  }
  return tally;
}

async function readDms(
  ctx: RunContext,
  account: AccountRow,
  start: AccountTally,
): Promise<{ tally: AccountTally; accessMissing: boolean }> {
  const social = ctx.deps.social();
  let listed: ProviderConversation[];
  try {
    listed = await social.listConversations({
      accountId: account.zernio_account_id,
      limit: CONVERSATIONS,
    });
  } catch (err) {
    // Zernio couldn't read this account's messages (Instagram's message access is off).
    if (isDmAccessMissing(err)) return { tally: start, accessMissing: true };
    throw err;
  }
  const conversations = listed.filter(
    (c) => !c.updatedTime || Date.parse(c.updatedTime) >= ctx.from.getTime(),
  );
  let tally = start;
  for (const conversation of conversations) {
    tally = await readConversation(ctx, account, conversation, tally);
  }
  return { tally, accessMissing: false };
}

async function readConversation(
  ctx: RunContext,
  account: AccountRow,
  conversation: ProviderConversation,
  start: AccountTally,
): Promise<AccountTally> {
  const { db } = ctx.deps;
  const messages = await ctx.deps.social().listConversationMessages({
    conversationId: conversation.id,
    accountId: account.zernio_account_id,
    limit: MESSAGES_PER_CONVERSATION,
  });
  const incoming = messages.filter((m) => m.direction === "incoming");
  if (incoming.length === 0) return start;

  // What Waggle has from this conversation (any id, and when), and first connect's missed DMs.
  const ids = incoming.map((m) => m.id);
  const [items, byId, missed] = await Promise.all([
    db
      .from("inbound_items")
      .select(
        "kind, zernio_comment_id, platform_message_id, zernio_message_id, received_at, conversations!inner (zernio_conversation_id)",
      )
      .eq("social_account_id", account.id)
      .eq("conversations.zernio_conversation_id", conversation.id)
      .limit(500),
    db
      .from("inbound_items")
      .select("platform_message_id, zernio_message_id")
      .eq("social_account_id", account.id)
      .in("platform_message_id", ids),
    db
      .from("missed_messages")
      .select("platform_message_id")
      .eq("social_account_id", account.id)
      .in("platform_message_id", ids),
  ]);
  const error = items.error ?? byId.error ?? missed.error;
  if (error) throw new Error(`weekly: messages lookup failed: ${error.message}`);
  const known = knownMessages({
    items: [
      ...(items.data ?? []).map((r) => ({
        kind: r.kind,
        zernio_comment_id: r.zernio_comment_id,
        platform_message_id: r.platform_message_id,
        zernio_message_id: r.zernio_message_id,
        received_at: r.received_at,
        zernio_conversation_id: r.conversations.zernio_conversation_id,
      })),
      ...(byId.data ?? []).map((r) => ({
        kind: "dm",
        zernio_comment_id: null,
        platform_message_id: r.platform_message_id,
        zernio_message_id: r.zernio_message_id,
        received_at: ctx.from.toISOString(),
        zernio_conversation_id: null,
      })),
    ],
    missed: (missed.data ?? []).map((r) => r.platform_message_id),
  });

  const sorted = sortWeekConversation(conversation.id, messages, {
    known,
    from: ctx.from,
    to: ctx.to,
    now: ctx.now,
    replyWindowMs: replyWindowMs(account.platform),
  });
  const toInsert = sorted.filter((s) => s.outcome === "insert").map((s) => s.message);
  const inserted = new Set<string>();
  if (toInsert.length > 0) {
    const name = conversation.participantName ?? toInsert.at(-1)?.senderName ?? null;
    const recorded = await recordConversation(db, {
      tenantId: account.tenant_id,
      socialAccountId: account.id,
      zernioConversationId: conversation.id,
      platform: account.platform,
      participantName: name,
      participantExternalId: conversation.participantId,
      customerMessageAt: toInsert.at(-1)!.createdAt,
    });
    if (!("foreign" in recorded)) {
      // Oldest first, the order webhooks would have brought them in.
      for (const m of toInsert) {
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
          senderKey: senderKeyFor({
            kind: "dm",
            email: false,
            sender: { id: conversation.participantId },
          }),
        });
        if (result.created) inserted.add(m.id);
      }
    }
  }

  let tally = start;
  for (const s of sorted) {
    const outcome: WeekOutcome =
      s.outcome === "insert" && !inserted.has(s.message.id) ? "known" : s.outcome;
    tally = await countOnly(ctx, tally, outcome, s.message.text ?? "", "dm");
  }
  return tally;
}

async function finishRun(
  db: ServiceClient,
  row: RunRow,
  accounts: RunAccount[],
  tally: Record<string, AccountTally>,
  now: Date,
): Promise<void> {
  const from = row.window_start;
  const to = row.window_end;
  const [{ data: items, error }, gapRows, { data: previous }, zone] = await Promise.all([
    db
      .from("inbound_items")
      .select(
        "social_account_id, kind, status, category, text, conversations (last_customer_message_at, platform)",
      )
      .eq("tenant_id", row.tenant_id)
      .gte("received_at", from)
      .lt("received_at", to)
      .limit(SUMMARY_ITEMS_MAX),
    loadGaps(db, row.tenant_id, 50),
    // Last week's run: the latest done run whose week ended within a day of this one's start.
    db
      .from("weekly_checks")
      .select("summary")
      .eq("tenant_id", row.tenant_id)
      .eq("status", "done")
      .gte("window_end", new Date(Date.parse(from) - DAY_MS).toISOString())
      .lte("window_end", new Date(Date.parse(from) + DAY_MS).toISOString())
      .order("finished_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    businessZoneOf(db, row.tenant_id),
  ]);
  if (error) throw new Error(`weekly: items lookup failed: ${error.message}`);
  const weekItems: WeekItemRow[] = (items ?? []).map((i) => {
    const window = i.conversations ? replyWindowMs(i.conversations.platform) : null;
    const last = i.conversations?.last_customer_message_at;
    return {
      social_account_id: i.social_account_id,
      kind: i.kind,
      status: i.status,
      category: i.category,
      text: i.text,
      dm_closes_at:
        i.kind === "dm" && last && window !== null
          ? new Date(Date.parse(last) + window).toISOString()
          : null,
    };
  });
  const prev = previous?.summary as { cameIn?: unknown } | null | undefined;
  const summary = buildWeekSummary({
    items: weekItems,
    tally,
    accounts: accounts.map((a) => ({
      id: a.id,
      platform: a.platform,
      name: a.name,
      state: a.state,
      reason: a.reason,
    })),
    gaps: groupGaps(gapRows),
    previousCameIn: typeof prev?.cameIn === "number" ? prev.cameIn : null,
    now,
    endOfToday: endOfLocalDay(now, zone),
  });
  await save(db, row.id, {
    status: "done",
    finished_at: now.toISOString(),
    locked_at: null,
    summary: summary as unknown as Json,
    email_status: row.trigger === "monday" ? "pending" : "none",
  });
  await writeAudit(db, {
    tenantId: row.tenant_id,
    action: "weekly_check_finished",
    actor: "system",
    details: {
      runId: row.id,
      trigger: row.trigger,
      outcome: "done",
      cameIn: summary.cameIn,
      found: summary.found,
      tooOld: summary.tooOld,
      accountsFailed: accounts.filter((a) => a.state === "failed").length,
    },
  });
}

async function save(
  db: ServiceClient,
  id: string,
  patch: {
    accounts?: Json;
    tally?: Json;
    status?: string;
    finished_at?: string;
    locked_at?: string | null;
    summary?: Json;
    email_status?: string;
  },
): Promise<void> {
  const { error } = await db.from("weekly_checks").update(patch).eq("id", id);
  if (error) throw new Error(`weekly: saving failed: ${error.message}`);
}
