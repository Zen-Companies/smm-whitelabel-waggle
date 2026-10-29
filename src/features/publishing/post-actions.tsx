"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { cancelPost, retryPost, type PostActionState } from "./actions";

/** Cancel a scheduled post. Errors stay on the row (design.md §4). */
export function CancelPostButton({ postId }: { postId: string }) {
  const [state, action, pending] = useActionState<PostActionState, FormData>(cancelPost, {});
  return (
    <form action={action} className="flex items-center gap-2">
      <input type="hidden" name="postId" value={postId} />
      <Button type="submit" variant="quiet" disabled={pending}>
        {pending ? "Cancelling…" : "Cancel"}
      </Button>
      {state.error && (
        <span role="alert" className="text-danger text-sm">
          {state.error}
        </span>
      )}
    </form>
  );
}

/** Retry now, or pick a new time (posts that failed during a pause must be rescheduled). */
export function RetryPostForm({ postId, label }: { postId: string; label: string }) {
  const [state, action, pending] = useActionState<PostActionState, FormData>(retryPost, {});
  const [later, setLater] = useState(false);
  const [local, setLocal] = useState("");
  return (
    <form action={action} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="postId" value={postId} />
      {later && (
        <>
          <label htmlFor={`retry-${postId}`} className="sr-only">
            New date and time
          </label>
          <input
            id={`retry-${postId}`}
            type="datetime-local"
            className="field max-w-60"
            value={local}
            onChange={(e) => setLocal(e.target.value)}
            required
          />
          <input
            type="hidden"
            name="scheduledFor"
            value={local ? new Date(local).toISOString() : ""}
          />
        </>
      )}
      <Button type="submit" variant="secondary" disabled={pending}>
        {pending ? "Saving…" : later ? "Reschedule" : label}
      </Button>
      {!later && (
        <Button type="button" variant="quiet" onClick={() => setLater(true)}>
          Pick a time
        </Button>
      )}
      {state.error && (
        <span role="alert" className="text-danger text-sm">
          {state.error}
        </span>
      )}
    </form>
  );
}
