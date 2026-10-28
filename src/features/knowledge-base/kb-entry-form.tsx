"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createKbEntry, deleteKbEntry, updateKbEntry, type KbFormState } from "./actions";
import { KB_CONTENT_MAX, KB_TITLE_MAX } from "./limits";

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
    <div className="flex flex-col gap-2 rounded-lg border p-4">
      <form key={state.savedAt} action={action} className="flex flex-col gap-2">
        {entry && <input type="hidden" name="id" value={entry.id} />}
        <Label htmlFor={`title-${key}`}>Title</Label>
        <Input
          id={`title-${key}`}
          name="title"
          defaultValue={entry?.title}
          placeholder="e.g. Opening hours"
          maxLength={KB_TITLE_MAX}
          required
        />
        <Label htmlFor={`content-${key}`}>Details</Label>
        <textarea
          id={`content-${key}`}
          name="content"
          defaultValue={entry?.content}
          placeholder="The facts the receptionist may use, e.g. Mon-Fri 7am-6pm, Sat-Sun 8am-4pm."
          maxLength={KB_CONTENT_MAX}
          rows={3}
          required
          className="border-input bg-background rounded-md border px-3 py-2 text-sm"
        />
        <div className="flex items-center gap-3 text-sm">
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : entry ? "Save" : "Add entry"}
          </Button>
          {entry && (
            <span className="text-muted-foreground">
              {entry.searchable ? "Used in replies" : "Indexing…"}
            </span>
          )}
          {state.saved && <span className="text-muted-foreground">Saved</span>}
          {state.error && (
            <span role="alert" className="text-destructive">
              {state.error}
            </span>
          )}
        </div>
      </form>
      {entry && (
        <form action={deleteKbEntry}>
          <input type="hidden" name="id" value={entry.id} />
          <Button type="submit" size="sm" variant="outline">
            Delete
          </Button>
        </form>
      )}
    </div>
  );
}
