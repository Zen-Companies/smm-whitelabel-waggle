"use client";

import { Check } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { createKbEntry, deleteKbEntry, updateKbEntry, type KbFormState } from "./actions";
import { KB_CONTENT_MAX, KB_TITLE_MAX } from "./limits";

/**
 * The one topic being edited (design v2: topics list | editor | gaps). Quiet form, real labels,
 * 44px fields (design.md §3); saved / error feedback in place. A new topic opens itself after
 * saving (the action redirects to it).
 */
export function KbEntryForm({
  entry,
  prefillTitle,
  prefillContent,
  suggestionId,
  changed,
}: {
  entry?: { id: string; title: string; content: string; searchable: boolean };
  prefillTitle?: string;
  /** A suggested topic's wording, with [...] blanks for the owner's facts (T33). */
  prefillContent?: string;
  suggestionId?: string;
  /** "Oct 28", when the topic was last changed. */
  changed?: string;
}) {
  // The Server Action itself (not a wrapper), so the form also works before JS loads.
  const [state, action, pending] = useActionState<KbFormState, FormData>(
    entry ? updateKbEntry : createKbEntry,
    {},
  );
  const key = entry?.id ?? "new";

  return (
    <form
      action={action}
      aria-labelledby={`edit-${key}`}
      className="card-lifted flex flex-col gap-4 p-5"
    >
      <h2 id={`edit-${key}`} className="section-title">
        {entry ? entry.title : "New topic"}
      </h2>
      {entry && <input type="hidden" name="id" value={entry.id} />}
      {suggestionId && <input type="hidden" name="suggestionId" value={suggestionId} />}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`title-${key}`} className="text-sm font-medium">
          Topic
        </label>
        <input
          id={`title-${key}`}
          name="title"
          defaultValue={entry?.title ?? prefillTitle}
          placeholder="e.g. Opening hours"
          maxLength={KB_TITLE_MAX}
          required
          className="field"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`content-${key}`} className="text-sm font-medium">
          What customers should be told
        </label>
        <textarea
          id={`content-${key}`}
          name="content"
          defaultValue={entry?.content ?? prefillContent}
          placeholder="e.g. Mon to Fri 7am to 9pm, weekends 8am to 10pm."
          maxLength={KB_CONTENT_MAX}
          rows={6}
          required
          autoFocus={!entry && !!prefillTitle}
          aria-invalid={state.error ? true : undefined}
          className="field"
        />
        {suggestionId && !state.error && (
          <p className="meta">
            Replace each [...] with your own details. Nothing is used until you add it.
          </p>
        )}
        {state.error && (
          <p role="alert" className="text-danger text-sm">
            {state.error}
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant={entry ? "secondary" : "primary"} disabled={pending}>
          {pending ? "Saving…" : entry ? "Save" : "Add topic"}
        </Button>
        {state.saved ? (
          <span role="status" className="inline-flex items-center gap-1 text-sm">
            <Check className="text-success size-4" strokeWidth={1.75} aria-hidden />
            Saved
          </span>
        ) : (
          entry && (
            <span className="meta">
              {changed ? `Last changed ${changed} · ` : ""}
              {entry.searchable ? "used in replies" : "getting ready to use in replies…"}
            </span>
          )
        )}
        {entry && (
          <Button
            type="submit"
            formAction={deleteKbEntry}
            formNoValidate
            variant="destructive"
            className="ml-auto"
          >
            Delete topic
          </Button>
        )}
      </div>
    </form>
  );
}
