import { createServerSupabase } from "@/lib/supabase/server";

// T17 audit trail (PRD F14): any reply that went out can be traced to its draft, the decision
// and the AI calls. Read through RLS (owners see their own tenant's rows only).

type Details = Record<string, unknown>;

const STATUS_WORDS: Record<string, string> = {
  classified: "sorted",
  drafted: "drafted",
  awaiting_approval: "waiting for approval",
  sending: "sending",
  sent: "sent",
  rejected: "not replied",
  ignored: "ignored",
  escalated: "handed to you",
  paused: "paused",
  failed: "failed",
  new: "received",
};

/** One plain-words line per audit row (design.md §7: no "LLM", "classifier", "webhook"). */
export function historyLine(action: string, d: Details, owner: () => string): string {
  switch (action) {
    case "item_received":
      return "Message received";
    case "status_changed": {
      const to = STATUS_WORDS[String(d.to)] ?? String(d.to);
      const why = d.policyReason ? ` (${String(d.policyReason).replaceAll("_", " ")})` : "";
      return d.decidedBy ? `${owner()} moved it to ${to}` : `Moved to ${to}${why}`;
    }
    case "classifier_fallback":
      return "Sorted with the backup model";
    case "draft_created":
      return d.needsHuman ? "Reply drafted, needs you" : "Reply drafted from your business info";
    case "draft_edited":
      return `${owner()} edited the reply`;
    case "draft_approved":
      return `${owner()} approved the reply`;
    case "draft_auto_approved":
      return "Approved automatically (auto-send)";
    case "draft_rejected":
      return `${owner()} chose not to reply`;
    case "reply_sent":
      return d.reconciled ? "Reply confirmed on the platform" : "Reply sent";
    case "send_failed":
      return "The platform refused the reply";
    case "delivery_failed":
      return "The reply wasn't delivered";
    case "lead_captured":
      return "Saved as a lead";
    case "alert_sent":
      return d.mode === "logged" ? "Owner alert logged (email not set up)" : "Owner emailed";
    case "escalated":
      return "Handed to you after 3 tries";
    default:
      return action.replaceAll("_", " ");
  }
}

const time = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });

export async function ItemHistory({ itemId }: { itemId: string }) {
  const supabase = await createServerSupabase();
  const [{ data: audit }, { data: usage }] = await Promise.all([
    supabase
      .from("audit_log")
      .select("id, created_at, action, actor, details")
      .eq("item_id", itemId)
      .order("created_at"),
    supabase
      .from("ai_usage")
      .select("id, created_at, purpose, model, input_tokens, output_tokens, cost_usd")
      .eq("item_id", itemId)
      .order("created_at"),
  ]);
  // Pass 1 has one owner per business, so an owner action is "You".
  const owner = () => "You";
  const total = (usage ?? []).reduce((s, u) => s + Number(u.cost_usd), 0);

  return (
    <details className="card p-4">
      <summary className="cursor-pointer text-sm font-medium">History and costs</summary>
      <ol className="mt-3 flex flex-col gap-2">
        {(audit ?? []).map((a) => (
          <li key={a.id} className="flex gap-3 text-sm">
            <time dateTime={a.created_at} className="meta w-36 shrink-0">
              {time(a.created_at)}
            </time>
            <span>{historyLine(a.action, (a.details ?? {}) as Details, owner)}</span>
          </li>
        ))}
      </ol>
      {(usage ?? []).length > 0 && (
        <div className="mt-4 flex flex-col gap-1">
          <p className="text-sm font-medium">AI calls</p>
          <ul className="meta flex flex-col gap-1">
            {(usage ?? []).map((u) => (
              <li key={u.id}>
                {u.purpose === "classify"
                  ? "Sorting"
                  : u.purpose === "draft"
                    ? "Drafting"
                    : "Search"}{" "}
                · {u.model} · {u.input_tokens + u.output_tokens} tokens · $
                {Number(u.cost_usd).toFixed(5)}
              </li>
            ))}
          </ul>
          <p className="meta">Total ${total.toFixed(5)}</p>
        </div>
      )}
    </details>
  );
}
