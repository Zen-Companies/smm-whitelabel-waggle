"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { disconnectAccountAction, type DisconnectState } from "./actions";

/** A connected account's quiet Disconnect, confirmed in place (docs/design.md §4). */
export function DisconnectAccount({ id, label }: { id: string; label: string }) {
  const [state, action, pending] = useActionState<DisconnectState, FormData>(
    disconnectAccountAction,
    {},
  );
  const [sure, setSure] = useState(false);
  if (state.done) return <span className="text-ink-3 text-sm">Disconnected.</span>;
  return sure ? (
    <form action={action} className="flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="id" value={id} />
      <span>Disconnect {label}? Waggle stops reading and answering it.</span>
      <Button type="submit" variant="secondary" className="min-h-[38px]" disabled={pending}>
        {pending ? "Disconnecting…" : "Disconnect"}
      </Button>
      <Button
        type="button"
        variant="quiet"
        className="min-h-[38px]"
        disabled={pending}
        onClick={() => setSure(false)}
      >
        Cancel
      </Button>
      {state.error && (
        <span role="alert" className="text-danger w-full">
          {state.error}
        </span>
      )}
    </form>
  ) : (
    <Button type="button" variant="quiet" className="min-h-[38px]" onClick={() => setSure(true)}>
      Disconnect
    </Button>
  );
}
