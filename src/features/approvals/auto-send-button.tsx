"use client";

import { Check } from "lucide-react";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { updateAutonomyMode, type AutonomyFormState } from "./actions";
import type { ConfigurableCategory } from "./autonomy";

/**
 * "Turn on Auto-send" from the Lab (T36 item 1), with a one-time confirm in place (no dialog, no
 * toast: design.md §4). Uses the same action as the Settings switch, so it's audited the same way.
 */
export function AutoSendButton({
  category,
  label,
}: {
  category: ConfigurableCategory;
  /** "questions", "leads": used in the sentences. */
  label: string;
}) {
  const [state, action, pending] = useActionState<AutonomyFormState, FormData>(
    updateAutonomyMode,
    {},
  );
  const [confirming, setConfirming] = useState(false);

  if (state.saved) {
    return (
      <p role="status" className="inline-flex items-center gap-1 text-sm font-medium">
        <Check className="text-success size-4" strokeWidth={1.75} aria-hidden />
        Auto-send is on for {label}. Switch back any time in Settings.
      </p>
    );
  }
  if (!confirming) {
    return (
      <div className="flex flex-col gap-1.5">
        <Button variant="primary" className="self-start" onClick={() => setConfirming(true)}>
          Turn on Auto-send for {label}
        </Button>
        <span className="meta">
          Asks you once to confirm. Switch back any time in Settings. Complaints still always come
          to you.
        </span>
      </div>
    );
  }
  return (
    <form action={action} className="bg-lavender flex flex-col gap-3 rounded-xl p-4">
      <input type="hidden" name="category" value={category} />
      <input type="hidden" name="mode" value="auto" />
      <p className="m-0 text-sm">
        Replies to {label} will go out on their own when your business info covers them. Anything it
        isn&apos;t sure about still comes to you.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary" disabled={pending} data-busy={pending || undefined}>
          {pending ? "Turning on…" : "Yes, turn on Auto-send"}
        </Button>
        <Button type="button" variant="quiet" onClick={() => setConfirming(false)}>
          Not yet
        </Button>
      </div>
      {state.error && (
        <p role="alert" className="text-danger m-0 text-sm">
          {state.error}
        </p>
      )}
    </form>
  );
}
