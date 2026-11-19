"use client";

import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { markHandledAction, type DecisionFormState } from "@/features/approvals";
import { timeLeft } from "./first-connect-copy";
import { markRevealSeen } from "./reveal-actions";

/** "Already handled" on the longest wait: takes it off the list, said in place (no toast). */
export function AlreadyHandled({ itemId }: { itemId: string }) {
  const [state, act, pending] = useActionState<DecisionFormState & { done?: boolean }, FormData>(
    async (prev, fd) => {
      const r = await markHandledAction(prev, fd);
      return r.error ? r : { done: true };
    },
    {},
  );
  if (state.done) {
    return (
      <p role="status" className="text-success text-sm font-semibold">
        Marked as handled. It’s off the list.
      </p>
    );
  }
  return (
    <form action={act} className="flex flex-col gap-1.5">
      <input type="hidden" name="itemId" value={itemId} />
      <Button type="submit" variant="secondary" disabled={pending} className="self-start">
        {pending ? "Saving…" : "Already handled"}
      </Button>
      {state.error && (
        <p role="alert" className="text-danger text-sm">
          {state.error}
        </p>
      )}
    </form>
  );
}

/** "3 h left", kept current every minute; nothing once the window has closed. */
export function CountdownPill({ expiresAt }: { expiresAt: string }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  // Rendered on the client only: the server's clock and the viewer's can disagree.
  const left = now ? timeLeft(expiresAt, now) : null;
  if (!left) return null;
  return (
    <span className="bg-danger-soft text-danger inline-flex min-h-[22px] items-center rounded-full px-2 text-xs font-semibold whitespace-nowrap tabular-nums">
      {left}
    </span>
  );
}

/** Marks the finished reveal seen, once, so Today stops offering it. */
export function MarkSeen({ catchUpId }: { catchUpId: string }) {
  useEffect(() => {
    void markRevealSeen(catchUpId);
  }, [catchUpId]);
  return null;
}
