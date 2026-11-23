import "server-only";
import { loadPlatformStatuses, statusOf } from "@/features/platforms";
import {
  loadReplyLimit,
  orgOnFree,
  planAllowsAutoReply,
  planLimitsOn,
  roomForAnotherAccount,
} from "@/features/billing";
import {
  authorHandle,
  catchUpAccountKeys,
  CLOSED_STATUSES,
  loadCatchUpProgress,
  pullsPastDms,
  responseScore,
  type CatchUpProgress,
  type ResponseScore,
} from "@/features/catch-up";
import { askFirstTopicsFor, isCustomTopic } from "@/lib/ask-first";
import { loadTenantAiSpend } from "@/lib/llm/spend";
import { hasLiveComments, platformLabel } from "@/lib/social/platforms";
import type { ServiceClient } from "@/lib/supabase/service";
import type { FlowFacts } from "./flow";
import { kindFromProfile } from "./starter";
import {
  batchReplies,
  conversationTopic,
  isMoneyTopic,
  setupTopic,
  TOPIC_LABEL,
  topicCounts,
  type BatchReply,
  type ReplyRow,
  type SetupTopic,
  type TopicCount,
} from "./topics";
import { uncheckedFactsByDraft } from "./unchecked-facts";
import { dayStrip, type StripDay, type StripItem } from "./day-strip";
import { readStateOf, type ReadState } from "./reading";

// Everything steps 2 and 3 of setup show, for one brand, from the first-connect engine
// (src/features/catch-up: the newest catch-up's pulled items, their drafts, missed_messages).
// Service role, filtered by the brand's id (the page checks the role first).

const DAY_MS = 24 * 60 * 60 * 1000;
/** Pulled items read for the screens (the sort cap is 500, plus DMs). */
const ITEMS_MAX = 800;
/** Lost DMs read for 2.2's list. */
const LOST_MAX = 600;
/** Platforms offered as "Customers may be waiting here too" on 2.3. */
const MORE_PLACES = ["instagram", "facebook", "googlebusiness", "tiktok"] as const;

export interface LostDm {
  key: string;
  name: string;
  text: string;
  topic: SetupTopic;
  receivedAt: string;
}

export interface WaitingMessage {
  itemId: string;
  author: string;
  kind: string;
  text: string;
  category: string | null;
  /**
   * Waggle wrote nothing (a complaint, unclear, the AI cap, out of replies): the owner writes the
   * reply. Otherwise Waggle tried but lacked the facts: the owner types them and Waggle writes it.
   */
  ownReply: boolean;
}

export interface SetupData {
  tenantId: string;
  brandName: string;
  namePending: boolean;
  savedScreen: string | null;
  finished: boolean;
  connected: boolean;
  /** Every platform connected and active ("Instagram"), for the end of setup. */
  connectedPlatforms: string[];
  progress: CatchUpProgress | null;
  /** A connected account that was read before (so no read now): "@sunnyside", else null. */
  readBefore: string | null;
  /** Connected moments ago and its read is on its way (no catch-up row yet): show reading. */
  startingRead: boolean;
  /** The platform Waggle read ("Instagram"). */
  platform: string;
  missed: {
    lostDms: number;
    closeToday: number;
    /** Every open DM with no reply (on platforms without Meta's 24-hour rule, all of them count). */
    dmsOpen: number;
    commentsOpen: number;
    capped: boolean;
    total: number;
    score: ResponseScore | null;
  };
  wanted: {
    count: number;
    /** "What they wanted", from Jev's categories (spam last, grey). */
    topics: TopicCount[];
    lost: LostDm[];
  };
  replies: {
    drafted: number;
    dmsToday: number;
    comments: number;
    example: BatchReply | null;
    /** Replies asked for and how many are written or handed over (still writing while less). */
    writing: { done: number; of: number };
    /** This month's AI replies are used up (the plan's replies or the AI spend cap). */
    outOfReplies: boolean;
  };
  batches: { money: BatchReply[]; rest: BatchReply[] };
  waiting: WaitingMessage[];
  /** Step 2's 30-day strip: what was found, by day. */
  strip: StripDay[];
  /** Facts in a draft that were found, not checked yet (build C), by draft id. */
  unchecked: Record<string, string[]>;
  more: { platform: string; label: string; upgrade: boolean }[];
  askFirst: { id: string; label: string; on: boolean }[];
  /** The owner's own Always ask me topics ("custom:…"). */
  askFirstCustom: string[];
  replyMode: "approve" | "auto";
  autoAllowed: boolean;
}

type ItemRow = {
  id: string;
  kind: string;
  category: string | null;
  status: string;
  text: string;
  author_name: string | null;
  received_at: string;
  draft_requested_at?: string | null;
};

type DraftRow = {
  id: string;
  item_id: string;
  body: string;
  edited_body: string | null;
  needs_human: boolean;
  status: string;
};

/** A pulled item asked to be drafted that has no outcome yet. */
const STILL_WRITING = new Set(["new", "classified", "drafted"]);

const isOpen = (status: string) => !(CLOSED_STATUSES as readonly string[]).includes(status);
const waitingCategory = (c: string | null) => c === "faq" || c === "lead" || c === "complaint";

/** Pure: the screen facts (which screens show) from the loaded data. */
export function flowFactsOf(d: SetupData): FlowFacts {
  return {
    namePending: d.namePending,
    wanted: d.wanted.count,
    lostDms: d.wanted.lost.length,
    drafted: d.replies.drafted,
    needYou: d.waiting.length,
    money: d.batches.money.length,
    quick: d.batches.rest.length,
  };
}

export async function loadSetupData(
  db: ServiceClient,
  input: { tenantId: string; organizationId: string; now?: Date },
): Promise<SetupData> {
  const now = input.now ?? new Date();
  const { tenantId } = input;
  const [{ data: tenant, error }, { data: accounts }, progress, { data: faq }, autoAllowed] =
    await Promise.all([
      db
        .from("tenants")
        .select(
          "name, name_pending, setup_screen, setup_done_at, ask_first_topics, business_profile",
        )
        .eq("id", tenantId)
        .single(),
      db
        .from("social_accounts")
        .select("id, platform, username, zernio_account_id, created_at")
        .eq("tenant_id", tenantId)
        .eq("status", "active"),
      loadCatchUpProgress(db, tenantId, now),
      db
        .from("autonomy_settings")
        .select("mode")
        .eq("tenant_id", tenantId)
        .eq("category", "faq")
        .maybeSingle(),
      planAllowsAutoReply(db, tenantId),
    ]);
  if (error) throw new Error(`setup tenant lookup failed: ${error.message}`);
  const connectedPlatforms = new Set((accounts ?? []).map((a) => a.platform));
  // No catch-up for the brand: the account was read before (in this or another brand: one read
  // per real account, ever, startCatchUp 20 Nov), or it connected moments ago and its read is
  // being started (the webhook upserts the account first), or there's nothing to read.
  const read = await readStateFor(db, { hasCatchUp: !!progress, accounts: accounts ?? [], now });
  const readBefore =
    read.state === "before" && read.account
      ? read.account.username
        ? `@${read.account.username.replace(/^@/, "")}`
        : platformLabel(read.account.platform)
      : null;

  const { data: cu } = progress
    ? await db
        .from("catch_ups")
        .select("id, social_account_id, capped, response_messages, response_answered")
        .eq("id", progress.catchUpId)
        .single()
    : { data: null };

  const [{ data: items }, { data: drafts }, { data: lost }] = await Promise.all([
    cu
      ? db
          .from("inbound_items")
          .select("id, kind, category, status, text, author_name, received_at, draft_requested_at")
          .eq("catch_up_id", cu.id)
          .order("received_at", { ascending: false })
          .limit(ITEMS_MAX)
      : Promise.resolve({ data: [] as ItemRow[] }),
    cu
      ? db
          .from("drafts")
          .select(
            "id, item_id, body, edited_body, needs_human, status, inbound_items!inner (catch_up_id)",
          )
          .eq("tenant_id", tenantId)
          .eq("inbound_items.catch_up_id", cu.id)
          .in("status", ["pending", "approved", "sent"])
          .order("created_at", { ascending: false })
          .limit(ITEMS_MAX)
      : Promise.resolve({ data: [] }),
    cu?.social_account_id
      ? db
          .from("missed_messages")
          .select("zernio_conversation_id, sender_name, text, received_at, category")
          .eq("social_account_id", cu.social_account_id)
          .order("received_at", { ascending: false })
          .limit(LOST_MAX)
      : Promise.resolve({ data: [] }),
  ]);

  const pulled = (items ?? []) as ItemRow[];
  const draftOf = new Map<string, DraftRow>();
  for (const d of (drafts ?? []) as unknown as DraftRow[]) {
    if (!draftOf.has(d.item_id)) draftOf.set(d.item_id, d);
  }

  // Lost DMs: one row per conversation, its newest message. Jev's category for the conversation
  // (sorted during the read, newest first); none (over the cap) leaves it to the words.
  const lostByConversation = new Map<string, LostDm>();
  const textsByConversation = new Map<string, string[]>();
  const categoryByConversation = new Map<string, string>();
  for (const m of lost ?? []) {
    const texts = textsByConversation.get(m.zernio_conversation_id) ?? [];
    texts.push(m.text);
    textsByConversation.set(m.zernio_conversation_id, texts);
    if (m.category && !categoryByConversation.has(m.zernio_conversation_id)) {
      categoryByConversation.set(m.zernio_conversation_id, m.category);
    }
    if (lostByConversation.has(m.zernio_conversation_id)) continue;
    lostByConversation.set(m.zernio_conversation_id, {
      key: m.zernio_conversation_id,
      name: authorHandle(m.sender_name) ?? "Someone",
      text: m.text,
      topic: "question",
      receivedAt: m.received_at,
    });
  }
  const lostDms = [...lostByConversation.values()].map((l) => ({
    ...l,
    topic: conversationTopic(
      textsByConversation.get(l.key) ?? [l.text],
      categoryByConversation.get(l.key) ?? null,
    ),
  }));

  const waitingPulled = pulled.filter((i) => waitingCategory(i.category) && isOpen(i.status));
  // "What they wanted": open questions, leads, complaints and unclear ones, plus spam whatever its
  // status (grey, last); spam stays out of the replies and batches.
  const wantedPulled = pulled.filter(
    (i) =>
      i.category === "spam" ||
      ((waitingCategory(i.category) || i.category === "unclear") && isOpen(i.status)),
  );
  const askers = [
    ...wantedPulled.map((i) => setupTopic(i.text, i.category)),
    ...lostDms.map((l) => l.topic),
  ];
  const lostMoney = lostDms.filter((l) => isMoneyTopic(l.topic)).length;
  const lockedCustomers = lostDms.filter((l) => l.topic !== "spam").length;
  const pulledMoney = waitingPulled.filter((i) =>
    isMoneyTopic(setupTopic(i.text, i.category)),
  ).length;

  const closeToday = waitingPulled.filter(
    (i) => i.kind === "dm" && Date.parse(i.received_at) + DAY_MS > now.getTime(),
  ).length;
  const commentsOpen = waitingPulled.filter((i) => i.kind === "comment").length;
  const dmsOpen = waitingPulled.filter((i) => i.kind === "dm").length;

  // Waggle's replies: drafts that answer (not "needs you"), waiting or already approved.
  const rows: ReplyRow[] = [];
  const waiting: WaitingMessage[] = [];
  for (const i of pulled) {
    const d = draftOf.get(i.id);
    if (!d) {
      // Handed to the owner with no draft at all: complaints, unclear, the AI cap, out of replies.
      if (i.status === "escalated" && i.category !== "spam") {
        waiting.push({
          itemId: i.id,
          author: authorHandle(i.author_name) ?? "A customer",
          kind: i.kind,
          text: i.text,
          category: i.category,
          ownReply: true,
        });
      }
      continue;
    }
    if (d.needs_human) {
      if (i.status === "escalated" && d.status === "pending") {
        waiting.push({
          itemId: i.id,
          author: authorHandle(i.author_name) ?? "A customer",
          kind: i.kind,
          text: i.text,
          category: i.category,
          ownReply: false,
        });
      }
      continue;
    }
    const approved = d.status === "approved" || d.status === "sent";
    const status =
      i.status === "awaiting_approval" || i.status === "sending" || i.status === "sent"
        ? i.status
        : approved
          ? "failed"
          : null;
    if (!status) continue;
    if (status === "awaiting_approval" && d.status !== "pending") continue;
    rows.push({
      itemId: i.id,
      draftId: d.id,
      kind: i.kind,
      author: authorHandle(i.author_name),
      text: i.text,
      reply: d.edited_body ?? d.body,
      category: i.category,
      receivedAt: i.received_at,
      status,
    });
  }
  // Complaints first (board "Setup, start to finish": "complaints always land here").
  waiting.sort((a, b) => Number(b.category === "complaint") - Number(a.category === "complaint"));
  const batches = batchReplies(rows, now);
  const asked = pulled.filter((i) => i.draft_requested_at);
  const unwritten = asked.filter((i) => STILL_WRITING.has(i.status)).length;
  const listed = [...batches.money, ...batches.rest];
  const example =
    listed.find((r) => !r.approved && r.kind === "dm") ?? listed.find((r) => !r.approved) ?? null;

  const [statuses, onFree, room, unchecked, outOfReplies] = await Promise.all([
    loadPlatformStatuses(db),
    orgOnFree(db, input.organizationId),
    roomForAnotherAccount(db, tenantId),
    uncheckedFactsByDraft(
      db,
      batches.money.filter((r) => !r.approved).map((r) => r.draftId),
    ),
    outOfAiReplies(db, { tenantId, organizationId: input.organizationId, now }),
  ]);
  const more = MORE_PLACES.filter(
    (p) => !connectedPlatforms.has(p) && statusOf(statuses, p) === "available",
  ).map((p) => ({ platform: p, label: platformLabel(p), upgrade: onFree && !room }));

  const kind = kindFromProfile(tenant.business_profile ?? "")?.key ?? null;
  const saved = new Set(tenant.ask_first_topics ?? []);
  const chosenBefore = tenant.setup_screen === "how" || tenant.setup_done_at !== null;
  const askFirst = askFirstTopicsFor(kind).map((t) => ({
    id: t.id,
    label: t.label,
    on: chosenBefore ? saved.has(t.id) : t.on || saved.has(t.id),
  }));

  const score = cu
    ? responseScore({ messages: cu.response_messages, answered: cu.response_answered })
    : null;

  return {
    tenantId,
    brandName: tenant.name,
    namePending: tenant.name_pending,
    savedScreen: tenant.setup_screen,
    finished: tenant.setup_done_at !== null,
    connected: connectedPlatforms.size > 0,
    connectedPlatforms: [...connectedPlatforms].map((p) => platformLabel(p)),
    progress,
    readBefore,
    startingRead: read.state === "starting",
    platform: platformLabel(progress?.platform ?? [...connectedPlatforms][0] ?? "instagram"),
    missed: {
      // Spam isn't a customer lost: it stays out of "DMs you can't answer any more".
      lostDms: lockedCustomers,
      closeToday,
      dmsOpen,
      commentsOpen,
      capped: cu?.capped ?? false,
      total: lockedCustomers + closeToday + commentsOpen,
      score,
    },
    wanted: { count: pulledMoney + lostMoney, topics: topicCounts(askers), lost: lostDms },
    replies: {
      drafted: listed.length,
      dmsToday: listed.filter((r) => r.kind === "dm").length,
      comments: listed.filter((r) => r.kind !== "dm").length,
      example,
      writing: { done: asked.length - unwritten, of: asked.length },
      outOfReplies,
    },
    batches,
    waiting,
    strip: dayStrip(stripItems(pulled, lost ?? []), now),
    unchecked,
    more,
    askFirst,
    askFirstCustom: (tenant.ask_first_topics ?? []).filter(isCustomTopic),
    replyMode: faq?.mode === "auto" && autoAllowed ? "auto" : "approve",
    autoAllowed,
  };
}

type AccountRow = {
  id: string;
  platform: string;
  username: string | null;
  zernio_account_id: string;
  created_at: string;
};

const isReadable = (platform: string) => hasLiveComments(platform) || pullsPastDms(platform);

/**
 * Where the brand's read stands (readStateOf), from catch-up history: a readable account counts
 * as read before only when a catch-up of the same real account (its account_key, or Zernio's
 * account id) belongs to another Waggle account row, in this brand or another.
 */
async function readStateFor(
  db: ServiceClient,
  input: { hasCatchUp: boolean; accounts: readonly AccountRow[]; now: Date },
): Promise<{ state: ReadState; account: AccountRow | null }> {
  if (input.hasCatchUp) return { state: "read", account: null };
  let found: { state: ReadState; account: AccountRow | null } = { state: "none", account: null };
  for (const a of input.accounts.filter((x) => isReadable(x.platform))) {
    const keys = catchUpAccountKeys({
      platform: a.platform,
      username: a.username,
      zernioAccountId: a.zernio_account_id,
    });
    const [byKey, byId] = await Promise.all([
      db.from("catch_ups").select("social_account_id").in("account_key", keys.all).limit(5),
      db
        .from("catch_ups")
        .select("social_account_id")
        .eq("zernio_account_id", a.zernio_account_id)
        .eq("platform", a.platform)
        .limit(5),
    ]);
    for (const r of [byKey, byId]) {
      if (r.error) throw new Error(`catch_ups history lookup failed: ${r.error.message}`);
    }
    const readElsewhere = [...(byKey.data ?? []), ...(byId.data ?? [])].some(
      (c) => c.social_account_id !== a.id,
    );
    const state = readStateOf({
      hasCatchUp: false,
      account: { readElsewhere, connectedAt: a.created_at },
      now: input.now,
    });
    if (state === "before") return { state, account: a };
    if (state === "starting") found = { state, account: a };
  }
  return found;
}

/**
 * For setup's connecting screen: whether the brand has an active account, and whether setup can
 * open step 2 (its read started, or there's nothing to read, or it was read before).
 */
export async function loadSetupConnected(
  db: ServiceClient,
  tenantId: string,
  now = new Date(),
): Promise<{ connected: boolean; ready: boolean }> {
  const [{ data: accounts, error }, { data: cu, error: cuError }] = await Promise.all([
    db
      .from("social_accounts")
      .select("id, platform, username, zernio_account_id, created_at")
      .eq("tenant_id", tenantId)
      .eq("status", "active"),
    db.from("catch_ups").select("id").eq("tenant_id", tenantId).limit(1),
  ]);
  if (error) throw new Error(`setup accounts lookup failed: ${error.message}`);
  if (cuError) throw new Error(`setup catch_ups lookup failed: ${cuError.message}`);
  if (!accounts?.length) return { connected: false, ready: false };
  const read = await readStateFor(db, { hasCatchUp: (cu ?? []).length > 0, accounts, now });
  return { connected: true, ready: read.state !== "starting" };
}

/** Whether this month's AI replies are used up (read only: no top-up is tried here). */
async function outOfAiReplies(
  db: ServiceClient,
  input: { tenantId: string; organizationId: string; now: Date },
): Promise<boolean> {
  try {
    const [spend, limitsOn] = await Promise.all([
      loadTenantAiSpend(db, input.tenantId, input.now),
      planLimitsOn(db),
    ]);
    if (spend.level === "reached") return true;
    if (!limitsOn) return false;
    const replies = await loadReplyLimit(db, input.organizationId, input.now);
    return replies?.limit.level === "reached";
  } catch {
    // Setup still shows; the banner is only a hint.
    return false;
  }
}

/** Pure: the strip's items: every pulled message (no reply while still open) and every lost DM. */
function stripItems(
  pulled: readonly ItemRow[],
  lost: readonly { received_at: string }[],
): StripItem[] {
  return [
    ...pulled.map((i) => ({ kind: i.kind, receivedAt: i.received_at, noReply: isOpen(i.status) })),
    ...lost.map((m) => ({ kind: "dm", receivedAt: m.received_at, noReply: true })),
  ];
}

/** The strip alone, for step 2 while Waggle reads (asked every few seconds). */
export async function loadSetupStrip(
  db: ServiceClient,
  tenantId: string,
  now = new Date(),
): Promise<StripDay[] | null> {
  const progress = await loadCatchUpProgress(db, tenantId, now);
  if (!progress) return null;
  const { data: cu } = await db
    .from("catch_ups")
    .select("id, social_account_id")
    .eq("id", progress.catchUpId)
    .single();
  if (!cu) return null;
  const [{ data: items }, { data: lost }] = await Promise.all([
    db
      .from("inbound_items")
      .select("id, kind, category, status, text, author_name, received_at")
      .eq("catch_up_id", cu.id)
      .order("received_at", { ascending: false })
      .limit(ITEMS_MAX),
    cu.social_account_id
      ? db
          .from("missed_messages")
          .select("received_at")
          .eq("social_account_id", cu.social_account_id)
          .order("received_at", { ascending: false })
          .limit(LOST_MAX)
      : Promise.resolve({ data: [] as { received_at: string }[] }),
  ]);
  return dayStrip(stripItems((items ?? []) as ItemRow[], lost ?? []), now);
}

/** Decision 8's progress card: the brand's setup replies on their way, from their statuses. */
export async function loadSetupSending(db: ServiceClient, tenantId: string): Promise<string[]> {
  const progress = await loadCatchUpProgress(db, tenantId);
  if (!progress) return [];
  const { data: drafts } = await db
    .from("drafts")
    .select("item_id, needs_human, status, inbound_items!inner (catch_up_id, status)")
    .eq("tenant_id", tenantId)
    .eq("inbound_items.catch_up_id", progress.catchUpId)
    .in("status", ["approved", "sent"])
    .limit(ITEMS_MAX);
  return ((drafts ?? []) as unknown as { inbound_items: { status: string } }[]).map(
    (d) => d.inbound_items.status,
  );
}

export { TOPIC_LABEL };
