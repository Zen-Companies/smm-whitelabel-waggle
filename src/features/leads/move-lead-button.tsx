"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { moveLeadAction, type MoveLeadState } from "./actions";

/** One move on a lead card ("Move to Booked"); the board refreshes in place. */
export function MoveLeadButton({
  leadId,
  stage,
  label,
}: {
  leadId: string;
  stage: string;
  label: string;
}) {
  const [state, action, pending] = useActionState<MoveLeadState, FormData>(moveLeadAction, {});
  return (
    <form action={action} className="ml-auto flex flex-col items-end">
      <input type="hidden" name="leadId" value={leadId} />
      <input type="hidden" name="stage" value={stage} />
      <Button type="submit" variant="secondary" className="min-h-9" disabled={pending}>
        {pending ? "Moving…" : label}
      </Button>
      {state.error && (
        <span role="alert" className="text-danger text-xs">
          {state.error}
        </span>
      )}
    </form>
  );
}
