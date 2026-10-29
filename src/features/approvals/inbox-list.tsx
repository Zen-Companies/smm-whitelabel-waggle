import Link from "next/link";
import { getCurrentTenant } from "@/features/tenants";
import { createServerSupabase } from "@/lib/supabase/server";
import { DraftCard, MessageHeader } from "./draft-card";
import { InboxLive } from "./inbox-live";
import { loadInbox, type InboxEntry } from "./inbox-data";

const ESCALATION_TEXT: Record<string, string> = {
  complaint: "A complaint: best answered by you.",
  unclear: "The receptionist wasn't sure what this is about.",
  spam: "Marked as spam.",
};

function escalationNote(entry: InboxEntry) {
  if (entry.draft?.needsHuman) {
    return `The knowledge base doesn't cover this${
      entry.draft.needsHumanReason ? ` (${entry.draft.needsHumanReason})` : ""
    }. Reply on ${entry.platform === "facebook" ? "Facebook" : "Instagram"} yourself, or add the answer to the knowledge base.`;
  }
  return (
    (entry.category && ESCALATION_TEXT[entry.category]) ??
    "The receptionist handed this to you. Reply on the platform yourself."
  );
}

export async function InboxList() {
  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  const { waiting, needsYou } = await loadInbox(supabase, tenant.id);

  return (
    <div className="flex flex-col gap-8">
      <InboxLive tenantId={tenant.id} />
      <section className="flex flex-col gap-3" aria-labelledby="waiting-heading">
        <h2 id="waiting-heading" className="text-lg font-medium">
          Waiting for approval ({waiting.length})
        </h2>
        {waiting.length === 0 && (
          <p className="text-muted-foreground text-sm">
            Nothing to approve. New drafts appear here.
          </p>
        )}
        {waiting.map((e) => (
          <DraftCard key={e.itemId} entry={e} />
        ))}
      </section>
      {needsYou.length > 0 && (
        <section className="flex flex-col gap-3" aria-labelledby="needs-you-heading">
          <h2 id="needs-you-heading" className="text-lg font-medium">
            Needs you ({needsYou.length})
          </h2>
          {needsYou.map((e) => (
            <article
              key={e.itemId}
              id={`item-${e.itemId}`}
              className="flex flex-col gap-2 rounded-lg border p-4"
            >
              <MessageHeader entry={e} />
              <blockquote className="border-l-2 pl-3 text-sm whitespace-pre-wrap">
                {e.text || "(no text)"}
              </blockquote>
              <p className="text-muted-foreground text-xs">{escalationNote(e)}</p>
              <Link href={`/inbox/items/${e.itemId}`} className="text-xs underline">
                Open conversation
              </Link>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
