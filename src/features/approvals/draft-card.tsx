"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { decideDraft, type DecisionFormState } from "./actions";
import { REPLY_MAX } from "./limits";
import type { InboxEntry } from "./inbox-data";

const CATEGORY = {
  faq: "Question",
  lead: "Lead",
  complaint: "Complaint",
  spam: "Spam",
  unclear: "Unclear",
} as const;

export function categoryLabel(category: string | null) {
  return CATEGORY[category as keyof typeof CATEGORY] ?? "Not sorted";
}

export function MessageHeader({ entry }: { entry: InboxEntry }) {
  const where = `${entry.platform === "facebook" ? "Facebook" : "Instagram"} ${
    entry.kind === "dm" ? "DM" : "comment"
  }`;
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 text-xs">
      <span className="text-foreground font-medium">{entry.authorName ?? "Someone"}</span>
      <span>{where}</span>
      <span>·</span>
      <time dateTime={entry.receivedAt}>{new Date(entry.receivedAt).toLocaleString()}</time>
      <span className="bg-muted rounded px-1.5 py-0.5">
        {categoryLabel(entry.category)}
        {entry.confidence !== null && ` ${Math.round(entry.confidence * 100)}%`}
      </span>
    </div>
  );
}

function windowNote(closesAt: string | null) {
  if (!closesAt) return null;
  const hours = (new Date(closesAt).getTime() - Date.now()) / 3_600_000;
  if (hours <= 0) return "The 24-hour DM window has closed: this reply can't be sent.";
  return hours < 1
    ? "DM window closes in under an hour."
    : `DM window closes in about ${Math.floor(hours)} h.`;
}

/** One waiting reply: original message, draft, facts used; approve / edit / reject. */
export function DraftCard({ entry }: { entry: InboxEntry }) {
  const [state, action, pending] = useActionState<DecisionFormState, FormData>(decideDraft, {});
  const draft = entry.draft!;
  const note = windowNote(entry.dmWindowClosesAt);

  return (
    <article id={`item-${entry.itemId}`} className="flex flex-col gap-3 rounded-lg border p-4">
      <MessageHeader entry={entry} />
      <blockquote className="border-l-2 pl-3 text-sm whitespace-pre-wrap">
        {entry.text || "(no text)"}
      </blockquote>
      <form action={action} className="flex flex-col gap-2">
        <input type="hidden" name="itemId" value={entry.itemId} />
        <input type="hidden" name="draftId" value={draft.id} />
        <label htmlFor={`reply-${entry.itemId}`} className="text-xs font-medium">
          Suggested reply (edit before approving if you like)
        </label>
        <textarea
          id={`reply-${entry.itemId}`}
          name="body"
          defaultValue={draft.editedBody ?? draft.body}
          maxLength={REPLY_MAX}
          rows={3}
          required
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        <p className="text-muted-foreground text-xs">
          {draft.facts.length
            ? `Based on: ${draft.facts.join(", ")}`
            : "No knowledge base facts were used."}
          {note && <span className="text-foreground block">{note}</span>}
        </p>
        <div className="flex items-center gap-2 text-sm">
          <Button type="submit" name="intent" value="approve" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Approve and send"}
          </Button>
          <Button
            type="submit"
            name="intent"
            value="reject"
            size="sm"
            variant="outline"
            disabled={pending}
            formNoValidate
          >
            Reject
          </Button>
          {state.error && (
            <span role="alert" className="text-destructive">
              {state.error}
            </span>
          )}
        </div>
      </form>
    </article>
  );
}
