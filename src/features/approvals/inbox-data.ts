import type { Database } from "@/lib/supabase/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { DM_REPLY_WINDOW_MS } from "./policy";

// What the approval inbox shows (PRD F8). Read with the owner's client, so RLS scopes it.

export interface InboxEntry {
  itemId: string;
  kind: "comment" | "dm";
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
  } | null;
  /** DMs: when Meta's 24-hour reply window closes (null if unknown). */
  dmWindowClosesAt: string | null;
  /** Comments: the post on Instagram/Facebook, for "Open in Instagram" (null if not known). */
  permalink: string | null;
  /** Comments: when it was hidden on the post (T40); null while it is visible. */
  hiddenOnPlatformAt: string | null;
}

export interface InboxData {
  waiting: InboxEntry[];
  needsYou: InboxEntry[];
}

const ESCALATED = ["escalated", "failed"] as const;

/** Statuses where the owner has to act: a reply to approve, or a message handed to them. */
export const NEEDS_OWNER = ["awaiting_approval", ...ESCALATED] as const;

export type InboxTab = "for_you" | "answered" | "ignored";
export const INBOX_TABS: { key: InboxTab; label: string; statuses: string[] }[] = [
  { key: "for_you", label: "For you", statuses: [...NEEDS_OWNER] },
  { key: "answered", label: "Answered", statuses: ["sending", "sent"] },
  // Spam, plus messages the owner marked as handled or chose not to answer.
  { key: "ignored", label: "Ignored", statuses: ["ignored", "handled", "rejected"] },
];

/** Pure: a ?tab= value, including the old To approve / Needs you / Sent links (emails, bookmarks). */
export function normalizeTab(param: string | undefined): InboxTab {
  if (param === "waiting" || param === "needs") return "for_you";
  if (param === "sent") return "answered";
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

/** Pure: the gray line under the headline (design.md §4). */
export function todayLine(today: Pick<TodaySummary, "answered" | "ignored" | "hidden">): string {
  const hid = today.hidden === 1 ? "hid 1 spam comment" : `hid ${today.hidden} spam comments`;
  return today.hidden > 0
    ? `Today Waggle answered ${today.answered}, ignored ${today.ignored} and ${hid}.`
    : `Today Waggle answered ${today.answered} and ignored ${today.ignored}.`;
}

/** Pure: midnight UTC of `now`'s day ("today" until businesses have a time zone). */
export function startOfTodayUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * The Today card (design.md §4): replies sent today, what's waiting for the owner now, and spam
 * hidden today.
 */
export async function loadTodaySummary(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  now = new Date(),
): Promise<TodaySummary> {
  const since = startOfTodayUtc(now).toISOString();
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
  const d = (data?.details ?? {}) as Record<string, unknown>;
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
      "id, kind, status, author_name, text, received_at, category, confidence, classifier_used, permalink, hidden_on_platform_at, " +
        "social_accounts (platform), conversations (last_customer_message_at)",
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
    kind: "comment" | "dm";
    status: string;
    author_name: string | null;
    text: string;
    received_at: string;
    category: string | null;
    confidence: number | null;
    classifier_used: string | null;
    permalink: string | null;
    hidden_on_platform_at: string | null;
    social_accounts: { platform: string } | null;
    conversations: { last_customer_message_at: string | null } | null;
  }[];
  if (rows.length === 0) return [];

  const { data: drafts } = await supabase
    .from("drafts")
    .select(
      "id, item_id, body, edited_body, needs_human, needs_human_reason, kb_entry_ids, status, sent_at, decided_by",
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

  return rows.map((r): InboxEntry & { status: string } => {
    const d = latest.get(r.id);
    const last = r.conversations?.last_customer_message_at;
    return {
      status: r.status,
      itemId: r.id,
      kind: r.kind,
      platform: r.social_accounts?.platform ?? "instagram",
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
          }
        : null,
      permalink: r.permalink,
      hiddenOnPlatformAt: r.hidden_on_platform_at,
      dmWindowClosesAt:
        r.kind === "dm" && last
          ? new Date(new Date(last).getTime() + DM_REPLY_WINDOW_MS).toISOString()
          : null,
    };
  });
}
