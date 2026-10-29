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
  } | null;
  /** DMs: when Meta's 24-hour reply window closes (null if unknown). */
  dmWindowClosesAt: string | null;
}

export interface InboxData {
  waiting: InboxEntry[];
  needsYou: InboxEntry[];
}

const ESCALATED = ["escalated", "failed"] as const;

export async function loadInbox(
  supabase: SupabaseClient<Database>,
  tenantId: string,
): Promise<InboxData> {
  const { data: items, error } = await supabase
    .from("inbound_items")
    .select(
      "id, kind, status, author_name, text, received_at, category, confidence, classifier_used, " +
        "social_accounts (platform), conversations (last_customer_message_at)",
    )
    .eq("tenant_id", tenantId)
    .in("status", ["awaiting_approval", ...ESCALATED])
    .order("received_at", { ascending: false })
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
  if (rows.length === 0) return { waiting: [], needsYou: [] };

  const { data: drafts } = await supabase
    .from("drafts")
    .select("id, item_id, body, edited_body, needs_human, needs_human_reason, kb_entry_ids, status")
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

  const entries = rows.map((r): InboxEntry & { status: string } => {
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
          }
        : null,
      dmWindowClosesAt:
        r.kind === "dm" && last
          ? new Date(new Date(last).getTime() + DM_REPLY_WINDOW_MS).toISOString()
          : null,
    };
  });

  return {
    // Oldest first: the customer who has waited longest is at the top.
    waiting: entries.filter((e) => e.status === "awaiting_approval" && e.draft).reverse(),
    needsYou: entries.filter((e) => e.status !== "awaiting_approval"),
  };
}
