"use client";

import { Check } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { createKbEntry, deleteKbEntry, updateKbEntry, type KbFormState } from "./actions";
import { KB_CONTENT_MAX, KB_TITLE_MAX } from "./limits";

/**
 * One piece of business info (docs/design.md §3: quiet forms, real labels, 44px fields).
 * The new-entry form carries the page's one primary pill; saved / error feedback is in place.
 */
export function KbEntryForm({
  entry,
}: {
  entry?: { id: string; title: string; content: string; searchable: boolean };
}) {
  // The Server Action itself (not a wrapper), so the form also works before JS loads.
  // A successful create changes savedAt, which remounts the form and clears it.
  const [state, action, pending] = useActionState<KbFormState, FormData>(
    entry ? updateKbEntry : createKbEntry,
    {},
  );
  const key = entry?.id ?? "new";

  return (
    <div className={entry ? "card flex flex-col gap-3 p-5" : "card-lifted flex flex-col gap-3 p-5"}>
      {!entry && <h2 className="section-title">Add business info</h2>}
      <form key={state.savedAt} action={action} className="flex flex-col gap-3">
        {entry && <input type="hidden" name="id" value={entry.id} />}
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`title-${key}`} className="text-sm font-medium">
            Topic
          </label>
          <input
            id={`title-${key}`}
            name="title"
            defaultValue={entry?.title}
            placeholder="e.g. Opening hours"
            maxLength={KB_TITLE_MAX}
            required
            className="field"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`content-${key}`} className="text-sm font-medium">
            Details
          </label>
          <textarea
            id={`content-${key}`}
            name="content"
            defaultValue={entry?.content}
            placeholder="What customers should be told, e.g. Mon to Fri 7am to 9pm, weekends 8am to 10pm."
            maxLength={KB_CONTENT_MAX}
            rows={3}
            required
            aria-invalid={state.error ? true : undefined}
            className="field"
          />
          {state.error && (
            <p role="alert" className="text-danger text-sm">
              {state.error}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant={entry ? "secondary" : "primary"} disabled={pending}>
            {pending ? "Saving…" : entry ? "Save" : "Add to business info"}
          </Button>
          {state.saved && (
            <span role="status" className="inline-flex items-center gap-1 text-sm">
              <Check className="text-success size-4" strokeWidth={1.75} aria-hidden />
              Saved
            </span>
          )}
          {entry && (
            <span className="meta">
              {entry.searchable ? "Used in replies" : "Getting ready to use in replies…"}
            </span>
          )}
        </div>
      </form>
      {entry && (
        <form action={deleteKbEntry} className="-mt-1">
          <input type="hidden" name="id" value={entry.id} />
          <Button type="submit" variant="destructive" className="-ml-3">
            Delete
          </Button>
        </form>
      )}
    </div>
  );
}
