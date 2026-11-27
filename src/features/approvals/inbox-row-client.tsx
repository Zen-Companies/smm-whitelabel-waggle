"use client";

import { useActionState, useEffect } from "react";
import {
  markConversationSeen,
  moveSenderToForYou,
  type MoveSenderState,
} from "./inbox-row-actions";

/** Opening a row: its "N new" counts again from now (Inbox by sender, 26 Nov). */
export function MarkConversationSeen({ itemId }: { itemId: string }) {
  useEffect(() => {
    void markConversationSeen(itemId);
  }, [itemId]);
  return null;
}

/** "Move a sender to For you" on an Updates & newsletters row; says so in place (no toast). */
export function MoveSenderButton({ itemId, name }: { itemId: string; name: string }) {
  const [state, action, pending] = useActionState<MoveSenderState, FormData>(
    moveSenderToForYou,
    {},
  );
  if (state.moved) {
    return (
      <p role="status" className="text-ink-2 text-[13px]">
        Moved. New mail from {name} shows in For you.
      </p>
    );
  }
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="itemId" value={itemId} />
      <button
        type="submit"
        disabled={pending}
        className="action-link with-arrow text-[13px] disabled:opacity-60"
      >
        {pending ? "Moving…" : "Move to For you"}
      </button>
      {state.error && <span className="text-danger text-[13px]">{state.error}</span>}
    </form>
  );
}
