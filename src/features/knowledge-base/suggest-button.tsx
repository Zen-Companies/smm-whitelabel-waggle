"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { suggestTopics, type SuggestState } from "./gap-actions";

/** "Suggest topics" (T33). The helper runs while the button waits; the result shows in place. */
export function SuggestButton() {
  const [state, action, pending] = useActionState<SuggestState, FormData>(suggestTopics, {});
  return (
    <form action={action} className="flex flex-col gap-2">
      <Button type="submit" variant="secondary" disabled={pending} className="self-start">
        {pending ? "Looking at the questions…" : "Suggest topics"}
      </Button>
      {!pending && state.added !== undefined && (
        <p role="status" className="meta">
          {state.added === 0
            ? "No new topics to suggest: these questions are covered or too different to group."
            : state.added === 1
              ? "1 topic suggested below."
              : `${state.added} topics suggested below.`}
        </p>
      )}
      {!pending && state.error && (
        <p role="alert" className="text-danger text-sm">
          {state.error}
        </p>
      )}
    </form>
  );
}
