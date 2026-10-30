"use client";

import { CirclePause, CirclePlay } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { setRepliesPaused, type PauseFormState } from "./actions";

/** One switch to stop everything going out (T27). The state shows in place, never as a toast. */
export function PauseForm({ paused }: { paused: boolean }) {
  const [state, action, pending] = useActionState<PauseFormState, FormData>(setRepliesPaused, {});
  return (
    <form
      action={action}
      className={`card flex flex-wrap items-center justify-between gap-3 p-5 ${paused ? "border-amber-border bg-amber-soft" : ""}`}
    >
      <input type="hidden" name="paused" value={paused ? "false" : "true"} />
      <div className="flex flex-col">
        <span className="font-semibold">{paused ? "Replies are paused" : "Replies are on"}</span>
        <span className="text-sm text-gray-700">
          {paused
            ? "Nothing is sent until you turn them back on. Replies you approve wait here."
            : "Pause everything at once if something looks wrong. Drafts still come to you."}
        </span>
      </div>
      <Button type="submit" variant={paused ? "primary" : "secondary"} disabled={pending}>
        {paused ? (
          <>
            <CirclePlay strokeWidth={1.75} aria-hidden /> Turn replies back on
          </>
        ) : (
          <>
            <CirclePause strokeWidth={1.75} aria-hidden /> Pause all replies
          </>
        )}
      </Button>
      {state.error && (
        <p role="alert" className="text-danger w-full text-sm">
          {state.error}
        </p>
      )}
    </form>
  );
}
