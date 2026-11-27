"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { stopRepeating, type StopRepeatState } from "./actions";

// The post panel's repeat block (Posts Round 5): how it repeats, the next times, and Stop
// repeating. The answer stays here (no toasts).

export interface RepeatInfo {
  id: string;
  /** "Every week on Friday at 9:00 AM". */
  label: string;
  /** "Until I stop it", "Until Sat 19 Dec", "6 times in all". */
  ends: string;
  /** "Then: Fri 5 Dec · Fri 12 Dec…" (only on the latest post of a live repeat). */
  then: string | null;
  state: "live" | "stopped" | "finished";
  made: number;
  /** Why the next one is waiting, in plain words. */
  held: string | null;
}

export function RepeatPanel({ repeat }: { repeat: RepeatInfo }) {
  const [state, action, pending] = useActionState<StopRepeatState, FormData>(stopRepeating, {});
  const live = repeat.state === "live" && !state.done;
  return (
    <section
      aria-label="Repeats"
      className="border-line bg-surface flex flex-col gap-1.5 rounded-xl border px-3 py-2.5 text-sm"
    >
      <p>
        <span aria-hidden className="text-honey-text font-semibold">
          ↻{" "}
        </span>
        <b className="font-semibold">{repeat.label}</b>
        <span className="text-ink-3"> · {repeat.ends}</span>
      </p>
      {live && repeat.then && <p className="text-ink-2 tabular-nums">{repeat.then}</p>}
      {live && repeat.held && <p className="text-honey-text">{repeat.held}</p>}
      {state.done || repeat.state === "stopped" ? (
        <p role="status" className="text-ink-2">
          Stopped repeating. A post already planned still goes out; no more after it.
        </p>
      ) : repeat.state === "finished" ? (
        <p className="text-ink-2">
          Done repeating: {repeat.made} {repeat.made === 1 ? "post" : "posts"} in all.
        </p>
      ) : (
        <form action={action} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="repeatId" value={repeat.id} />
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "Stopping…" : "Stop repeating"}
          </Button>
          <span className="meta">Same text and photos each time.</span>
        </form>
      )}
      {state.error && (
        <p role="alert" className="text-danger">
          {state.error}
        </p>
      )}
    </section>
  );
}
