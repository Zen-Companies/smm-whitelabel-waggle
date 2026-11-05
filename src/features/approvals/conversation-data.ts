import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

// The middle and right panes of the inbox (design v2): the conversation thread, who the customer
// is, the lead if any, and what has happened, in plain words. Read with the owner's client (RLS).

export interface ThreadMessage {
  key: string;
  from: "customer" | "business";
  text: string;
  at: string;
  /** Business messages: who approved it ("you") or auto-send ("auto"). */
  by?: "you" | "auto";
  itemId: string;
}

export interface ActivityLine {
  at: string;
  text: string;
}

export interface ConversationContext {
  customer: {
    name: string;
    platform: string;
    kind: "comment" | "dm" | "review";
    messages: number;
    firstSeenAt: string;
  };
  lead: {
    id: string;
    name: string | null;
    contact: string | null;
    request: string | null;
  } | null;
  activity: ActivityLine[];
}

const CATEGORY: Record<string, string> = {
  faq: "a question",
  lead: "a lead",
  complaint: "a complaint",
  unclear: "unclear",
  spam: "spam",
};

const HANDED: Record<string, string> = {
  complaint: "complaints always come to you",
  unclear: "not clear what they want",
  low_confidence: "not sure what they want",
  needs_human: "not in your business info",
  mode_off: "replies are off for this kind",
  ai_cap_reached: "this month's AI allowance is used",
  dm_window_closed: "reply window closed",
  dm_window_closing: "reply window closing",
  account_inactive: "account disconnected",
  send_rejected: "Instagram/Facebook refused it",
  retries_exhausted: "couldn't be sent",
};

/**
 * Pure: the item's history as a few plain lines (design v2: outcomes, never machinery: no
 * model names, tokens or costs; those stay on the operator's Costs page).
 */
export function activityLines(
  audit: { action: string; created_at: string; details: Record<string, unknown> }[],
  ctx: { category: string | null; factTitles: string[] },
): ActivityLine[] {
  const out: ActivityLine[] = [];
  for (const a of audit) {
    const d = a.details ?? {};
    const to = typeof d.to === "string" ? d.to : null;
    let text: string | null = null;
    switch (a.action) {
      case "item_received":
        text = "Message received";
        break;
      case "status_changed":
        if (to === "classified")
          text = `Recognized as ${CATEGORY[ctx.category ?? ""] ?? "a message"}`;
        else if (to === "awaiting_approval") text = "Waiting for your OK";
        else if (to === "escalated") {
          const why = HANDED[String(d.policyReason ?? d.sendReason ?? "")];
          text = why ? `Handed to you: ${why}` : "Handed to you";
        } else if (to === "failed") text = "Couldn't be sent";
        else if (to === "handled") text = "Marked as handled";
        else if (to === "ignored") text = "Hidden as spam";
        else if (to === "paused") text = "Waiting for the account to reconnect";
        break;
      case "draft_created":
        text = d.needsHuman
          ? "Reply drafted, needs your input"
          : ctx.factTitles.length
            ? `Reply written from ${ctx.factTitles.join(", ")}`
            : "Reply written";
        break;
      case "draft_edited":
        text = "Edited by you";
        break;
      case "draft_approved":
        text = "Approved by you";
        break;
      case "draft_auto_approved":
        text = "Approved automatically";
        break;
      case "draft_approval_undone":
        text = "Approval undone";
        break;
      case "draft_rejected":
        text = "You chose not to reply";
        break;
      case "reply_sent":
        text = "Reply sent";
        break;
      case "lead_captured":
        text = "Saved to Leads";
        break;
      case "delivery_failed":
        text = "Reply not delivered";
        break;
    }
    if (text && out.at(-1)?.text !== text) out.push({ at: a.created_at, text });
  }
  return out;
}

/** Pure: which inbox tab shows an item, so old /inbox/items/<id> links land on the right one. */
export function tabForStatus(status: string): "for_you" | "answered" | "ignored" {
  if (status === "sent" || status === "sending") return "answered";
  if (status === "ignored" || status === "handled" || status === "rejected") return "ignored";
  return "for_you";
}

export async function loadConversation(
  supabase: SupabaseClient<Database>,
  tenantId: string,
  itemId: string,
): Promise<{ thread: ThreadMessage[]; context: ConversationContext } | null> {
  const { data: itemRow } = await supabase
    .from("inbound_items")
    .select("id, kind, conversation_id, author_name, category, social_accounts (platform)")
    .eq("id", itemId)
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (!itemRow) return null;
  const item = itemRow as unknown as {
    id: string;
    kind: "comment" | "dm" | "review";
    conversation_id: string | null;
    author_name: string | null;
    category: string | null;
    social_accounts: { platform: string } | null;
  };

  const { data: threadItems } = item.conversation_id
    ? await supabase
        .from("inbound_items")
        .select("id, text, received_at, status")
        .eq("tenant_id", tenantId)
        .eq("conversation_id", item.conversation_id)
        .neq("status", "ignored")
        .order("received_at")
        .limit(50)
    : await supabase
        .from("inbound_items")
        .select("id, text, received_at, status")
        .eq("id", item.id);
  const ids = (threadItems ?? []).map((t) => t.id);

  const [{ data: drafts }, { data: leads }, { data: audit }, stats] = await Promise.all([
    supabase
      .from("drafts")
      .select(
        "id, item_id, body, edited_body, status, sent_at, decided_by, kb_entry_ids, created_at",
      )
      .in("item_id", ids)
      .order("created_at"),
    supabase
      .from("leads")
      .select("id, name, contact, request, created_at")
      .in("item_id", ids)
      .order("created_at", { ascending: false })
      .limit(1),
    supabase
      .from("audit_log")
      .select("action, created_at, details")
      .eq("item_id", item.id)
      .order("created_at"),
    item.author_name
      ? supabase
          .from("inbound_items")
          .select("received_at")
          .eq("tenant_id", tenantId)
          .eq("author_name", item.author_name)
          .order("received_at")
      : Promise.resolve({ data: [] as { received_at: string }[] }),
  ]);

  const thread: ThreadMessage[] = [];
  for (const t of threadItems ?? []) {
    thread.push({
      key: `c-${t.id}`,
      from: "customer",
      text: t.text,
      at: t.received_at,
      itemId: t.id,
    });
  }
  for (const d of drafts ?? []) {
    if (d.status === "sent" && d.sent_at) {
      thread.push({
        key: `b-${d.id}`,
        from: "business",
        text: d.edited_body ?? d.body,
        at: d.sent_at,
        by: d.decided_by ? "you" : "auto",
        itemId: d.item_id,
      });
    }
  }
  thread.sort((a, b) => a.at.localeCompare(b.at));

  // Facts behind this item's latest draft, by title, for the activity line.
  const own = (drafts ?? []).filter((d) => d.item_id === item.id).at(-1);
  const factIds = own?.kb_entry_ids ?? [];
  const { data: facts } = factIds.length
    ? await supabase.from("kb_entries").select("id, title").in("id", factIds)
    : { data: [] as { id: string; title: string }[] };

  const seen = stats.data ?? [];
  return {
    thread,
    context: {
      customer: {
        name: item.author_name ?? "A customer",
        platform: item.social_accounts?.platform ?? "instagram",
        kind: item.kind,
        messages: Math.max(1, seen.length),
        firstSeenAt:
          seen[0]?.received_at ?? (threadItems ?? [])[0]?.received_at ?? new Date().toISOString(),
      },
      lead: leads?.[0]
        ? {
            id: leads[0].id,
            name: leads[0].name,
            contact: leads[0].contact,
            request: leads[0].request,
          }
        : null,
      activity: activityLines(
        (audit ?? []).map((a) => ({
          action: a.action,
          created_at: a.created_at,
          details: (a.details ?? {}) as Record<string, unknown>,
        })),
        { category: item.category, factTitles: (facts ?? []).map((f) => f.title) },
      ),
    },
  };
}
