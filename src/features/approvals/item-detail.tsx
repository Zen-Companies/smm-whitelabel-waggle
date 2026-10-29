import { CircleCheck } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { clockTime, shortTime } from "@/components/app/time";
import { MarkItemRead } from "@/features/alerts";
import { getCurrentTenant } from "@/features/tenants";
import { createServerSupabase } from "@/lib/supabase/server";
import { ApprovalCard, MessageHeader, RecentSends } from "./approval-card";
import { HeldCard } from "./held-card";
import { heldReason, loadEntries } from "./inbox-data";
import { ItemHistory } from "./item-history";

// One message and its conversation (PRD F11/F12: the link in alert emails and on the leads page).

const STATUS: Record<string, string> = {
  new: "Received",
  classified: "Sorted",
  drafted: "Drafted",
  awaiting_approval: "Waiting for your OK",
  sending: "Sending",
  sent: "Replied",
  rejected: "Not replied",
  ignored: "Ignored (spam)",
  escalated: "Needs you",
  paused: "Waiting for the account to reconnect",
  failed: "Couldn't be answered",
  handled: "Handled by you",
};

export async function ItemDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();

  // Through RLS: another tenant's id is simply not found.
  const { data: item } = await supabase
    .from("inbound_items")
    .select("id, kind, status, conversation_id, author_name")
    .eq("id", id)
    .eq("tenant_id", tenant.id)
    .maybeSingle();
  if (!item) notFound();

  // The thread: a DM's whole conversation, or the comment alone.
  const { data: thread } = item.conversation_id
    ? await supabase
        .from("inbound_items")
        .select("id")
        .eq("tenant_id", tenant.id)
        .eq("conversation_id", item.conversation_id)
        .order("received_at")
        .limit(50)
    : { data: [{ id: item.id }] };
  const ids = (thread ?? []).map((t) => t.id);

  const [entries, { data: leads }] = await Promise.all([
    loadEntries(supabase, tenant.id, { itemIds: ids }),
    supabase.from("leads").select("item_id, name, contact, request").in("item_id", ids),
  ]);
  const current = entries.find((e) => e.itemId === id);
  const reason =
    current && (current.status === "escalated" || current.status === "failed")
      ? await heldReason(supabase, id, current.status)
      : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link href="/inbox" className="text-sm text-gray-700">
          ← Inbox
        </Link>
        <h1 className="page-title">{item.author_name ?? "Conversation"}</h1>
        <p className="text-gray-700">
          {item.kind === "dm" ? "Direct messages" : "A comment on your post"}
        </p>
      </div>

      <MarkItemRead itemId={id} />
      <RecentSends />
      <ol className="flex flex-col gap-6">
        {entries.map((entry) => {
          const lead = leads?.find((l) => l.item_id === entry.itemId);
          const isCurrent = entry.itemId === id;
          const reply =
            entry.draft && (entry.draft.status === "sent" || entry.status === "sending")
              ? (entry.draft.editedBody ?? entry.draft.body)
              : null;
          return (
            <li key={entry.itemId} id={`item-${entry.itemId}`} className="flex flex-col gap-3">
              <p className="meta">
                {shortTime(entry.receivedAt)} · {STATUS[entry.status] ?? entry.status}
              </p>
              {entry.status === "awaiting_approval" && entry.draft ? (
                <ApprovalCard entry={entry} nextHref={null} />
              ) : isCurrent && (entry.status === "escalated" || entry.status === "failed") ? (
                <HeldCard entry={entry} reason={reason} />
              ) : (
                <article className="card flex flex-col gap-4 p-5">
                  <MessageHeader entry={entry} />
                  <p className="whitespace-pre-wrap">{entry.text || "(no text)"}</p>
                  {reply && (
                    <div className="ml-6 flex flex-col gap-1 rounded-md bg-gray-50 p-4">
                      <p className="meta inline-flex items-center gap-1.5">
                        <CircleCheck
                          className="text-success size-4"
                          strokeWidth={1.75}
                          aria-hidden
                        />
                        Your reply
                        {entry.draft?.sentAt ? ` · ${clockTime(entry.draft.sentAt)}` : ""}
                      </p>
                      <p className="whitespace-pre-wrap">{reply}</p>
                    </div>
                  )}
                </article>
              )}
              {lead && (
                <dl className="card grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 p-4 text-sm">
                  <dt className="col-span-2 mb-1">
                    <span className="chip-lead">Lead</span>
                  </dt>
                  <dt className="meta">Name</dt>
                  <dd>{lead.name ?? "Not given"}</dd>
                  <dt className="meta">Contact</dt>
                  <dd>{lead.contact ?? "Not given"}</dd>
                  <dt className="meta">Request</dt>
                  <dd>{lead.request ?? "Not given"}</dd>
                </dl>
              )}
              {isCurrent && <ItemHistory itemId={id} />}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
