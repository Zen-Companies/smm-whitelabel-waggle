import { startOfDayIn } from "@/lib/time/zone";
import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseAttachments, type Attachment } from "./attachments";
import { dmWindowClosesAt, dmWindowFor } from "./policy";
import { type ActivityEntry, mergeActivity } from "./today-activity";

// What the approval inbox shows (PRD F8). Read with the owner's client, so RLS scopes it.

export interface InboxEntry {
  itemId: string;
  kind: "comment" | "dm" | "review" | "call";
  platform: string;
  authorName: string | null;
  text: string;
  receivedAt: string;
  category: string | null;
  confidence: number | null;
  classifierUsed: string | null;
  draft: {
    id: string;
    body: string;
    editedBody: string | null;
    needsHuman: boolean;
    needsHumanReason: string | null;
    facts: string[];
    status: string;
    sentAt: string | null;
    /** False when the reply went out on its own (auto mode): nobody approved it. */
    decidedByOwner: boolean;
    /** T41: a comment's reply goes under the comment ("public") or in the commenter's DMs. */
    replyVia: "public" | "dm";
  } | null;
  /** Failed send attempts so far (a retry is checking whether the last one went through). */
  attempts: number;
  /** DMs: when the platform's reply window closes (null if unknown or the platform has none). */
  dmWindowClosesAt: string | null;
  /** Email (T81b): the thread's subject, when known. */
  subject?: string | null;
  /** T82b: a missed call or voicemail. */
  call?: { voicemail: boolean; durationSeconds: number } | null;
  /** DMs on a platform with a reply cap (TikTok, T61): replies left in this window. */
  dmRepliesLeft?: number | null;
  /** Comments: the post on Instagram/Facebook, for "Open in Instagram" (null if not known). */
  permalink: string | null;
  /** Comments: when it was hidden on the post (T40); null while it is visible. */
  hiddenOnPlatformAt: string | null;
  /** Reviews (T42): true = recommends, false = doesn't, null = not given or not a review. */
  reviewRecommends: boolean | null;
  /** Google reviews (T61): 1–5 stars; null otherwise. */
  reviewRating?: number | null;
  /** T65: the owner answered on the platform itself (Google), so Waggle's draft wasn't sent. */
  answeredOnPlatformAt?: string | null;
  /** T72: what the message carried besides words (kinds only). */
  attachments?: Attachment[];
  /** T72: false when the account it came in on stopped connecting (sending can't work). */
  accountActive?: boolean;
}

export interface InboxData {
  waiting: InboxEntry[];
  needsYou: InboxEntry[];
}

const ESCALATED = ["escalated", "failed"] as const;

/** Statuses where the owner has to act: a reply to approve, or a message handed to them. */
// First connect (20 Nov): pulled questions and leads past the reveal's first 20 wait here for
// their draft (awaiting_draft); opening one writes it.
export const NEEDS_OWNER = ["awaiting_approval", "awaiting_draft", ...ESCALATED] as const;

export type InboxTab = "for_you" | "answered" | "ignored";
export const INBOX_TABS: { key: InboxTab; label: string; statuses: string[] }[] = [
  { key: "for_you", label: "For you", statuses: [...NEEDS_OWNER] },
  { key: "answered", label: "Answered", statuses: ["sending", "sent"] },
  // T72 "Hidden": spam, plus messages the owner marked as handled or chose not to answer.
  { key: "ignored", label: "Hidden", statuses: ["ignored", "handled", "rejected"] },
];

/** T72: who answered, for the Answered filter (All, Waggle on its own, You approved, You wrote). */
export type AnsweredBy = "auto" | "approved" | "wrote";
export const ANSWERED_FILTERS: { key: AnsweredBy | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "auto", label: "Waggle on its own" },
  { key: "approved", label: "You approved" },
  { key: "wrote", label: "You wrote" },
];

/** Pure: who answered a reply that went out (null when there's no draft). */
export function answeredBy(entry: Pick<InboxEntry, "draft">): AnsweredBy | null {
  const d = entry.draft;
  if (!d) return null;
  if (!d.decidedByOwner) return "auto";
  return d.editedBody !== null && d.editedBody.trim() !== d.body.trim() ? "wrote" : "approved";
}

/** Pure: the ?by= value, including the older "auto" links. */
export function normalizeAnsweredBy(param: string | undefined): AnsweredBy | "all" {
  return param === "auto" || param === "approved" || param === "wrote" ? param : "all";
}

/** Pure: a ?tab= value, including the old To approve / Needs you / Sent links (emails, bookmarks). */
export function normalizeTab(param: string | undefined): InboxTab {
  if (param === "waiting" || param === "needs") return "for_you";
  if (param === "sent") return "answered";
  if (param === "hidden") return "ignored";
  return INBOX_TABS.some((t) => t.key === param) ? (param as InboxTab) : "for_you";
}

export function needsOwner(status: string): boolean {
  return (NEEDS_OWNER as readonly string[]).includes(status);
}

/** One tab of the two-pane inbox. For you is oldest first: the longest-waiting customer on top. */
export async function loadInboxTab(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  tab: InboxTab,
): Promise<(InboxEntry & { status: string })[]> {
  const statuses = INBOX_TABS.find((t) => t.key === tab)!.statuses;
  const entries = await loadEntries(supabase, tenantId, { statuses });
  if (tab !== "for_you") return entries;
  // A reply waiting for approval always has its draft; one without it isn't ready to show yet.
  return entries.filter((e) => e.status !== "awaiting_approval" || e.draft).reverse();
}

export interface TodaySummary {
  answered: number;
  forYou: number;
  ignored: number;
  /** Spam comments hidden on their post today, by Waggle or the owner (T40). */
  hidden: number;
}

/** Pure: the gray line under the headline (design.md §4); no zeros (rule 4, 16 Nov). */
export function todayLine(today: Pick<TodaySummary, "answered" | "ignored" | "hidden">): string {
  const parts: string[] = [];
  if (today.answered) parts.push(`answered ${today.answered}`);
  if (today.ignored) parts.push(`ignored ${today.ignored}`);
  if (today.hidden)
    parts.push(today.hidden === 1 ? "hid 1 spam comment" : `hid ${today.hidden} spam comments`);
  if (parts.length === 0) return "Nothing answered on its own yet today.";
  const list =
    parts.length === 1
      ? parts[0]
      : `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
  return `Today Waggle ${list}.`;
}

/**
 * Pure: the search box's words as an ilike pattern, safe inside a PostgREST or() filter (no
 * commas, brackets, quotes or wildcards of its own). Null under two letters.
 */
export function searchPattern(q: string | undefined): string | null {
  const words = (q ?? "")
    .replace(/[%_*,()"\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return words.length >= 2 ? `%${words}%` : null;
}

/** Pure: which tab a status lives in (search results say where each one is). */
export function tabOf(status: string): InboxTab | null {
  return INBOX_TABS.find((t) => t.statuses.includes(status))?.key ?? null;
}

/**
 * Search (Inbox polish, approved 16 Nov): names, the customer's words and Waggle's replies,
 * across all three tabs, newest first.
 */
export async function searchInbox(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  pattern: string,
): Promise<(InboxEntry & { status: string })[]> {
  const statuses = INBOX_TABS.flatMap((t) => t.statuses);
  const quoted = `"${pattern}"`;
  const [{ data: items }, { data: drafts }] = await Promise.all([
    supabase
      .from("inbound_items")
      .select("id")
      .eq("tenant_id", tenantId)
      .in("status", statuses)
      .or(`text.ilike.${quoted},author_name.ilike.${quoted}`)
      .order("received_at", { ascending: false })
      .limit(50),
    supabase
      .from("drafts")
      .select("item_id")
      .eq("tenant_id", tenantId)
      .or(`body.ilike.${quoted},edited_body.ilike.${quoted}`)
      .order("created_at", { ascending: false })
      .limit(50),
  ]);
  const ids = [
    ...new Set([...(items ?? []).map((i) => i.id), ...(drafts ?? []).map((d) => d.item_id)]),
  ];
  if (ids.length === 0) return [];
  const found = await loadEntries(supabase, tenantId, { itemIds: ids, statuses });
  return found.reverse();
}

/** Pure: midnight UTC of `now`'s day. */
export function startOfTodayUtc(now: Date): Date {
  return startOfDayIn(now, "UTC");
}

/**
 * The Today card (design.md §4): replies sent today, what's waiting for the owner now, and spam
 * hidden today.
 */
export async function loadTodaySummary(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  now = new Date(),
  timeZone = "UTC",
): Promise<TodaySummary> {
  // "Today" starts at the viewer's own midnight (19 Nov).
  const since = startOfDayIn(now, timeZone).toISOString();
  const [answered, forYou, ignored, hidden] = await Promise.all([
    supabase
      .from("drafts")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "sent")
      .gte("sent_at", since),
    supabase
      .from("inbound_items")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .in("status", [...NEEDS_OWNER]),
    supabase
      .from("inbound_items")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("status", "ignored")
      .gte("received_at", since),
    supabase
      .from("inbound_items")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .gte("hidden_on_platform_at", since),
  ]);
  return {
    answered: answered.count ?? 0,
    forYou: forYou.count ?? 0,
    ignored: ignored.count ?? 0,
    hidden: hidden.count ?? 0,
  };
}

/** "What Waggle did today" (empty inbox): replies sent and messages ignored since the viewer's midnight. */
export async function loadTodayActivity(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  now = new Date(),
  limit = 5,
  timeZone = "UTC",
): Promise<ActivityEntry[]> {
  const since = startOfDayIn(now, timeZone).toISOString();
  const [sent, ignored] = await Promise.all([
    supabase
      .from("drafts")
      .select("sent_at, inbound_items!inner (id, kind, author_name, text)")
      .eq("tenant_id", tenantId)
      .eq("status", "sent")
      .gte("sent_at", since)
      .order("sent_at", { ascending: false })
      .limit(limit),
    supabase
      .from("inbound_items")
      .select("id, kind, author_name, text, received_at")
      .eq("tenant_id", tenantId)
      .eq("status", "ignored")
      .gte("received_at", since)
      .order("received_at", { ascending: false })
      .limit(limit),
  ]);
  const answered = (sent.data ?? []).flatMap((d): ActivityEntry[] => {
    const i = d.inbound_items as unknown as {
      id: string;
      kind: ActivityEntry["kind"];
      author_name: string | null;
      text: string;
    } | null;
    return i && d.sent_at
      ? [
          {
            itemId: i.id,
            what: "answered",
            kind: i.kind,
            authorName: i.author_name,
            text: i.text,
            at: d.sent_at,
          },
        ]
      : [];
  });
  const skipped = (ignored.data ?? []).map((i): ActivityEntry => ({
    itemId: i.id,
    what: "ignored",
    kind: i.kind as ActivityEntry["kind"],
    authorName: i.author_name,
    text: i.text,
    at: i.received_at,
  }));
  return mergeActivity(answered, skipped, limit);
}

/** Pure: how long the customer waited for the reply, short ("6s", "4m", "2h", "3d"). */
export function responseTime(receivedAt: string, sentAt: string): string {
  const s = Math.max(0, Math.round((Date.parse(sentAt) - Date.parse(receivedAt)) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86_400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86_400)}d`;
}

export interface NextPost {
  id: string;
  title: string;
  platforms: number;
  scheduledFor: string;
}

/** The Next post card: the business's next scheduled post, if any. */
export async function loadNextPost(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  now = new Date(),
): Promise<NextPost | null> {
  const { data } = await supabase
    .from("posts")
    .select("id, content, target_account_ids, scheduled_for")
    .eq("tenant_id", tenantId)
    .eq("status", "scheduled")
    .gte("scheduled_for", now.toISOString())
    .order("scheduled_for")
    .limit(1)
    .maybeSingle();
  if (!data?.scheduled_for) return null;
  return {
    id: data.id,
    title: postTitle(data.content),
    platforms: data.target_account_ids.length,
    scheduledFor: data.scheduled_for,
  };
}

/** Pure: a post's first line, short enough for a card title. */
export function postTitle(content: string): string {
  const first = content.trim().split(/\r?\n/)[0] ?? "";
  return first.length > 60 ? `${first.slice(0, 57).trimEnd()}…` : first || "Untitled post";
}

/** Counts per tab, for the segmented control. */
export async function countInboxTabs(
  supabase: SupabaseClient<Database>,
  tenantId: string,
): Promise<Record<InboxTab, number>> {
  const counts = await Promise.all(
    INBOX_TABS.map(async (t) => {
      const { count } = await supabase
        .from("inbound_items")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .in("status", t.statuses);
      return [t.key, count ?? 0] as const;
    }),
  );
  return Object.fromEntries(counts) as Record<InboxTab, number>;
}

/**
 * Why a held item came to the owner: the reason code on its last status change (policy,
 * send step or runner). Read through RLS.
 */
export async function heldReason(
  supabase: SupabaseClient<Database>,
  itemId: string,
  status: string,
): Promise<string | null> {
  const { data } = await supabase
    .from("audit_log")
    .select("details")
    .eq("item_id", itemId)
    .eq("action", "status_changed")
    .eq("details->>to", status)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return heldReasonFromDetails(data?.details ?? null);
}

/** Pure: the reason code in a `status_changed` audit row's details (also read by Analytics). */
export function heldReasonFromDetails(details: unknown): string | null {
  const d = (details && typeof details === "object" ? details : {}) as Record<string, unknown>;
  if (d.reason === "fail") return "retries_exhausted";
  if (d.reason === "delivery_failed") return "delivery_failed";
  const pick = (v: unknown) => (typeof v === "string" ? v : null);
  return pick(d.policyReason) ?? pick(d.sendReason) ?? null;
}

export async function loadInbox(
  supabase: SupabaseClient<Database>,
  tenantId: string,
): Promise<InboxData> {
  const entries = await loadEntries(supabase, tenantId, {
    statuses: ["awaiting_approval", ...ESCALATED],
  });
  return {
    // Oldest first: the customer who has waited longest is at the top.
    waiting: entries.filter((e) => e.status === "awaiting_approval" && e.draft).reverse(),
    needsYou: entries.filter((e) => e.status !== "awaiting_approval"),
  };
}

/** Items with their latest draft, newest first (or oldest first for a thread). */
export async function loadEntries(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  filter: { statuses?: string[]; itemIds?: string[] },
): Promise<(InboxEntry & { status: string })[]> {
  let query = supabase
    .from("inbound_items")
    .select(
      "id, kind, status, attempts, author_name, text, received_at, category, confidence, classifier_used, permalink, hidden_on_platform_at, review_recommends, review_rating, conversation_id, answered_on_platform_at, call_voicemail, call_duration_seconds, attachments, " +
        "social_accounts (platform, status), conversations (last_customer_message_at, subject)",
    )
    .eq("tenant_id", tenantId);
  if (filter.statuses) query = query.in("status", filter.statuses);
  if (filter.itemIds) query = query.in("id", filter.itemIds);
  const { data: items, error } = await query
    .order("received_at", { ascending: !!filter.itemIds })
    .limit(100);
  if (error) throw new Error(`inbox load failed: ${error.message}`);
  const rows = (items ?? []) as unknown as {
    id: string;
    kind: "comment" | "dm" | "review" | "call";
    status: string;
    attempts: number;
    author_name: string | null;
    text: string;
    received_at: string;
    category: string | null;
    confidence: number | null;
    classifier_used: string | null;
    permalink: string | null;
    hidden_on_platform_at: string | null;
    review_recommends: boolean | null;
    review_rating: number | null;
    conversation_id: string | null;
    answered_on_platform_at: string | null;
    call_voicemail: boolean | null;
    call_duration_seconds: number | null;
    attachments: unknown;
    social_accounts: { platform: string; status: string } | null;
    conversations: { last_customer_message_at: string | null; subject: string | null } | null;
  }[];
  if (rows.length === 0) return [];

  const { data: drafts } = await supabase
    .from("drafts")
    .select(
      "id, item_id, body, edited_body, needs_human, needs_human_reason, kb_entry_ids, status, sent_at, decided_by, reply_via",
    )
    .in(
      "item_id",
      rows.map((r) => r.id),
    )
    .order("created_at", { ascending: false });
  const latest = new Map<string, NonNullable<typeof drafts>[number]>();
  for (const d of drafts ?? []) if (!latest.has(d.item_id)) latest.set(d.item_id, d);

  const kbIds = [...new Set([...latest.values()].flatMap((d) => d.kb_entry_ids))];
  const { data: kb } = kbIds.length
    ? await supabase.from("kb_entries").select("id, title").in("id", kbIds)
    : { data: [] };
  const titles = new Map((kb ?? []).map((e) => [e.id, e.title]));

  const repliesSent = await countCappedReplies(supabase, rows);

  return rows.map((r): InboxEntry & { status: string } => {
    const d = latest.get(r.id);
    const last = r.conversations?.last_customer_message_at;
    const platform = r.social_accounts?.platform ?? "instagram";
    return {
      status: r.status,
      itemId: r.id,
      kind: r.kind,
      platform,
      authorName: r.author_name,
      text: r.text,
      receivedAt: r.received_at,
      category: r.category,
      confidence: r.confidence === null ? null : Number(r.confidence),
      classifierUsed: r.classifier_used,
      draft: d
        ? {
            id: d.id,
            body: d.body,
            editedBody: d.edited_body,
            needsHuman: d.needs_human,
            needsHumanReason: d.needs_human_reason,
            // Titles of the facts the draft was written from; deleted entries drop out.
            facts: d.kb_entry_ids.flatMap((id) => titles.get(id) ?? []),
            status: d.status,
            sentAt: d.sent_at,
            decidedByOwner: d.decided_by !== null,
            replyVia: r.kind === "comment" && d.reply_via === "dm" ? "dm" : "public",
          }
        : null,
      attempts: r.attempts,
      permalink: r.permalink,
      hiddenOnPlatformAt: r.hidden_on_platform_at,
      reviewRecommends: r.review_recommends,
      reviewRating: r.review_rating,
      answeredOnPlatformAt: r.answered_on_platform_at,
      attachments: parseAttachments(r.attachments),
      accountActive: (r.social_accounts?.status ?? "active") === "active",
      subject: r.conversations?.subject ?? null,
      call:
        r.kind === "call"
          ? { voicemail: r.call_voicemail === true, durationSeconds: r.call_duration_seconds ?? 0 }
          : null,
      dmWindowClosesAt:
        r.kind === "dm"
          ? (dmWindowClosesAt(platform, last ? new Date(last) : null)?.toISOString() ?? null)
          : null,
      dmRepliesLeft: (() => {
        const cap = r.kind === "dm" ? dmWindowFor(platform)?.maxReplies : null;
        if (cap == null || !r.conversation_id) return null;
        return Math.max(0, cap - (repliesSent.get(r.conversation_id) ?? 0));
      })(),
    };
  });
}

/**
 * Replies sent since the customer's last message, per conversation, for DMs on a platform with a
 * reply cap (TikTok: 10 in 48 hours). Other rows aren't counted.
 */
async function countCappedReplies(
  supabase: SupabaseClient<Database>,
  rows: {
    kind: string;
    conversation_id: string | null;
    social_accounts: { platform: string } | null;
    conversations: { last_customer_message_at: string | null } | null;
  }[],
): Promise<Map<string, number>> {
  const since = new Map<string, string>();
  for (const r of rows) {
    const last = r.conversations?.last_customer_message_at;
    if (r.kind !== "dm" || !r.conversation_id || !last) continue;
    if (dmWindowFor(r.social_accounts?.platform ?? "instagram")?.maxReplies == null) continue;
    since.set(r.conversation_id, last);
  }
  const counts = new Map<string, number>();
  if (since.size === 0) return counts;
  const { data } = await supabase
    .from("drafts")
    .select("sent_at, inbound_items!inner (conversation_id)")
    .eq("status", "sent")
    .in("inbound_items.conversation_id", [...since.keys()]);
  for (const d of (data ?? []) as unknown as {
    sent_at: string | null;
    inbound_items: { conversation_id: string | null };
  }[]) {
    const id = d.inbound_items.conversation_id;
    if (!id || !d.sent_at || d.sent_at < since.get(id)!) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}
