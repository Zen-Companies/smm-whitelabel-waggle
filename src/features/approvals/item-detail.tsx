import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentTenant } from "@/features/tenants";
import { createServerSupabase } from "@/lib/supabase/server";
import { DraftCard, MessageHeader } from "./draft-card";
import { loadEntries, type InboxEntry } from "./inbox-data";

// One message and its conversation (PRD F11/F12: the link in alert emails and on the leads page).

const STATUS: Record<string, string> = {
  new: "Received",
  classified: "Sorted",
  drafted: "Drafted",
  awaiting_approval: "Waiting for your approval",
  sending: "Sending",
  sent: "Replied",
  rejected: "Rejected",
  ignored: "Ignored (spam)",
  escalated: "Needs you",
  paused: "Paused (account or billing)",
  failed: "Failed",
};

export async function ItemDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();

  // Through RLS: another tenant's id is simply not found.
  const { data: item } = await supabase
    .from("inbound_items")
    .select("id, kind, status, conversation_id, social_account_id")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (!item) notFound();

  // The thread: a DM's whole conversation, or the comment alone.
  const { data: thread } = item.conversation_id
    ? await supabase
        .from("inbound_items")
        .select("id, status")
        .eq("tenant_id", tenant.id)
        .eq("conversation_id", item.conversation_id)
        .order("received_at")
        .limit(50)
    : { data: [{ id: item.id, status: item.status }] };
  const ids = (thread ?? []).map((t) => t.id);

  const [{ data: drafts }, { data: leads }, entries] = await Promise.all([
    supabase
      .from("drafts")
      .select("id, item_id, body, edited_body, status, sent_at")
      .in("item_id", ids)
      .order("created_at"),
    supabase.from("leads").select("item_id, name, contact, request").in("item_id", ids),
    loadEntries(supabase, tenant.id, { itemIds: ids }),
  ]);
  const statusOf = new Map((thread ?? []).map((t) => [t.id, t.status]));

  return (
    <div className="flex flex-col gap-4">
      <Link href="/inbox" className="text-muted-foreground text-sm">
        ← Inbox
      </Link>
      {entries.map((entry: InboxEntry) => {
        const status = statusOf.get(entry.itemId) ?? "";
        const lead = leads?.find((l) => l.item_id === entry.itemId);
        const sent = drafts?.filter((d) => d.item_id === entry.itemId && d.status === "sent");
        return (
          <section
            key={entry.itemId}
            id={`item-${entry.itemId}`}
            className={`flex flex-col gap-2 ${entry.itemId === id ? "" : "opacity-80"}`}
          >
            <p className="text-xs font-medium">{STATUS[status] ?? status}</p>
            {status === "awaiting_approval" && entry.draft ? (
              <DraftCard entry={entry} />
            ) : (
              <article className="flex flex-col gap-2 rounded-lg border p-4">
                <MessageHeader entry={entry} />
                <blockquote className="border-l-2 pl-3 text-sm whitespace-pre-wrap">
                  {entry.text || "(no text)"}
                </blockquote>
                {sent?.map((d) => (
                  <p key={d.id} className="bg-muted rounded-md p-2 text-sm whitespace-pre-wrap">
                    <span className="text-muted-foreground block text-xs">
                      Reply sent {d.sent_at ? new Date(d.sent_at).toLocaleString() : ""}
                    </span>
                    {d.edited_body ?? d.body}
                  </p>
                ))}
                {entry.draft?.needsHuman && (
                  <p className="text-muted-foreground text-xs">
                    Not covered by the knowledge base
                    {entry.draft.needsHumanReason ? `: ${entry.draft.needsHumanReason}` : ""}.
                  </p>
                )}
              </article>
            )}
            {lead && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-sm">
                <dt className="text-muted-foreground">Lead</dt>
                <dd>{lead.name ?? "No name given"}</dd>
                <dt className="text-muted-foreground">Contact</dt>
                <dd>{lead.contact ?? "Not given"}</dd>
                <dt className="text-muted-foreground">Request</dt>
                <dd>{lead.request ?? "Not given"}</dd>
              </dl>
            )}
          </section>
        );
      })}
    </div>
  );
}
