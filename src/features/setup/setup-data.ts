import "server-only";
import { loadPlatformStatuses, statusOf } from "@/features/platforms";
import { orgOnFree, planAllowsAutoReply, roomForAnotherAccount } from "@/features/billing";
import {
  authorHandle,
  CLOSED_STATUSES,
  loadCatchUpProgress,
  responseScore,
  type CatchUpProgress,
  type ResponseScore,
} from "@/features/catch-up";
import { askFirstTopicsFor } from "@/lib/ask-first";
import { platformLabel } from "@/lib/social/platforms";
import type { ServiceClient } from "@/lib/supabase/service";
import type { FlowFacts } from "./flow";
import { kindFromProfile } from "./starter";
import {
  batchReplies,
  isMoneyTopic,
  setupTopic,
  TOPIC_LABEL,
  topicCounts,
  type BatchReply,
  type ReplyRow,
  type SetupTopic,
} from "./topics";
import { uncheckedFactsByDraft } from "./unchecked-facts";

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
}

export interface SetupData {
  tenantId: string;
  brandName: string;
  namePending: boolean;
  savedScreen: string | null;
  finished: boolean;
  connected: boolean;
  progress: CatchUpProgress | null;
  /** The platform Waggle read ("Instagram"). */
  platform: string;
  missed: {
    lostDms: number;
    closeToday: number;
    commentsOpen: number;
    capped: boolean;
    total: number;
    score: ResponseScore | null;
  };
  wanted: {
    count: number;
    topics: { topic: SetupTopic; label: string; count: number }[];
    lost: LostDm[];
  };
  replies: {
    drafted: number;
    dmsToday: number;
    comments: number;
    example: BatchReply | null;
  };
  batches: { money: BatchReply[]; rest: BatchReply[] };
  waiting: WaitingMessage[];
  /** Facts in a draft that were found, not checked yet (build C), by draft id. */
  unchecked: Record<string, string[]>;
  more: { platform: string; label: string; upgrade: boolean }[];
  askFirst: { id: string; label: string; on: boolean }[];
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
};

type DraftRow = {
  id: string;
  item_id: string;
  body: string;
  edited_body: string | null;
  needs_human: boolean;
  status: string;
};

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
        .select("platform")
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
          .select("id, kind, category, status, text, author_name, received_at")
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
          .select("zernio_conversation_id, sender_name, text, received_at")
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

  // Lost DMs: one row per conversation, its newest message.
  const lostByConversation = new Map<string, LostDm>();
  const textsByConversation = new Map<string, string[]>();
  for (const m of lost ?? []) {
    const texts = textsByConversation.get(m.zernio_conversation_id) ?? [];
    texts.push(m.text);
    textsByConversation.set(m.zernio_conversation_id, texts);
    if (lostByConversation.has(m.zernio_conversation_id)) continue;
    lostByConversation.set(m.zernio_conversation_id, {
      key: m.zernio_conversation_id,
      name: authorHandle(m.sender_name) ?? "Someone",
      text: m.text,
      topic: "other",
      receivedAt: m.received_at,
    });
  }
  const lostDms = [...lostByConversation.values()].map((l) => {
    const texts = textsByConversation.get(l.key) ?? [l.text];
    // Any message about buying makes the conversation a money one.
    const topics = texts.map((t) => setupTopic(t));
    const topic = topics.find(isMoneyTopic) ?? topics.find((t) => t !== "other") ?? "other";
    return { ...l, topic };
  });

  const waitingPulled = pulled.filter((i) => waitingCategory(i.category) && isOpen(i.status));
  const askers = [
    ...waitingPulled
      .filter((i) => i.category !== "complaint")
      .map((i) => ({ text: i.text, category: i.category })),
    ...lostDms.map((l) => ({ text: l.text, category: l.topic === "order" ? "lead" : null })),
  ];
  const lostMoney = lostDms.filter((l) => isMoneyTopic(l.topic)).length;
  const pulledMoney = waitingPulled.filter(
    (i) => i.category !== "complaint" && isMoneyTopic(setupTopic(i.text, i.category)),
  ).length;

  const closeToday = waitingPulled.filter(
    (i) => i.kind === "dm" && Date.parse(i.received_at) + DAY_MS > now.getTime(),
  ).length;
  const commentsOpen = waitingPulled.filter((i) => i.kind === "comment").length;

  // Waggle's replies: drafts that answer (not "needs you"), waiting or already approved.
  const rows: ReplyRow[] = [];
  const waiting: WaitingMessage[] = [];
  for (const i of pulled) {
    const d = draftOf.get(i.id);
    if (!d) continue;
    if (d.needs_human) {
      if (i.status === "escalated" && d.status === "pending") {
        waiting.push({
          itemId: i.id,
          author: authorHandle(i.author_name) ?? "A customer",
          kind: i.kind,
          text: i.text,
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
  const batches = batchReplies(rows, now);
  const listed = [...batches.money, ...batches.rest];
  const example =
    listed.find((r) => !r.approved && r.kind === "dm") ?? listed.find((r) => !r.approved) ?? null;

  const [statuses, onFree, room, unchecked] = await Promise.all([
    loadPlatformStatuses(db),
    orgOnFree(db, input.organizationId),
    roomForAnotherAccount(db, tenantId),
    uncheckedFactsByDraft(
      db,
      batches.money.filter((r) => !r.approved).map((r) => r.draftId),
    ),
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
    progress,
    platform: platformLabel(progress?.platform ?? [...connectedPlatforms][0] ?? "instagram"),
    missed: {
      lostDms: lostDms.length,
      closeToday,
      commentsOpen,
      capped: cu?.capped ?? false,
      total: lostDms.length + closeToday + commentsOpen,
      score,
    },
    wanted: { count: pulledMoney + lostMoney, topics: topicCounts(askers), lost: lostDms },
    replies: {
      drafted: listed.length,
      dmsToday: listed.filter((r) => r.kind === "dm").length,
      comments: listed.filter((r) => r.kind !== "dm").length,
      example,
    },
    batches,
    waiting,
    unchecked,
    more,
    askFirst,
    replyMode: faq?.mode === "auto" && autoAllowed ? "auto" : "approve",
    autoAllowed,
  };
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
