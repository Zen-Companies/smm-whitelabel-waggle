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
  } | null;
  /** DMs: when Meta's 24-hour reply window closes (null if unknown). */
  dmWindowClosesAt: string | null;
}

export interface InboxData {
  waiting: InboxEntry[];
  needsYou: InboxEntry[];
}

const ESCALATED = ["escalated", "failed"] as const;

export type InboxTab = "waiting" | "needs" | "sent";
export const INBOX_TABS: { key: InboxTab; label: string; statuses: string[] }[] = [
  { key: "waiting", label: "To approve", statuses: ["awaiting_approval"] },
  { key: "needs", label: "Needs you", statuses: [...ESCALATED] },
  // Spam (ignored) stays hidden (design.md §3).
  { key: "sent", label: "Sent", statuses: ["sending", "sent"] },
];

/** One tab of the two-pane inbox: waiting oldest first (longest-waiting customer on top). */
export async function loadInboxTab(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  tab: InboxTab,
): Promise<(InboxEntry & { status: string })[]> {
  const statuses = INBOX_TABS.find((t) => t.key === tab)!.statuses;
  const entries = await loadEntries(supabase, tenantId, { statuses });
  return tab === "waiting" ? entries.filter((e) => e.draft).reverse() : entries;
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
      "id, kind, status, author_name, text, received_at, category, confidence, classifier_used, " +
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
    social_accounts: { platform: string } | null;
    conversations: { last_customer_message_at: string | null } | null;
  }[];
  if (rows.length === 0) return [];

  const { data: drafts } = await supabase
    .from("drafts")
    .select(
      "id, item_id, body, edited_body, needs_human, needs_human_reason, kb_entry_ids, status, sent_at",
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
          }
        : null,
      dmWindowClosesAt:
        r.kind === "dm" && last
          ? new Date(new Date(last).getTime() + DM_REPLY_WINDOW_MS).toISOString()
          : null,
    };
  });
}
