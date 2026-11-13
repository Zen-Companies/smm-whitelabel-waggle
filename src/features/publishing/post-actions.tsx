"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { cancelPost, retryPost, takeDown, type PostActionState, type TakeDownState } from "./actions";
import { platformLabel } from "@/lib/social/platforms";
import { takeDownSplit } from "./take-down";

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

/**
 * Take a published post down (T75c), asked first in place: where it will be removed, and where
 * the owner has to do it in the app (Instagram, TikTok, Snapchat). YouTube removal is permanent.
 */
export function TakeDownButton({ postId, platforms }: { postId: string; platforms: string[] }) {
  const [state, action, pending] = useActionState<TakeDownState, FormData>(takeDown, {});
  const [asking, setAsking] = useState(false);
  const { removable, byHand } = takeDownSplit(platforms);
  const names = (ps: string[]) => ps.map(platformLabel).join(", ");
  if (state.done) {
    return (
      <p role="status" className="text-sm">
        {state.done}
      </p>
    );
  }
  if (!asking) {
    return (
      <Button type="button" variant="quiet" onClick={() => setAsking(true)}>
        Take down
      </Button>
    );
  }
  return (
    <form
      action={action}
      className="border-honey-border bg-honey-tint flex w-full flex-col gap-2 rounded-xl border p-3 text-sm"
    >
      <input type="hidden" name="postId" value={postId} />
      {removable.length > 0 ? (
        <p>
          <b className="font-semibold">Take it down from {names(removable)}?</b>
          {removable.includes("youtube") ? " On YouTube the video is deleted for good." : ""}
        </p>
      ) : (
        <p>Waggle can&apos;t remove posts from {names(byHand)}.</p>
      )}
      {byHand.length > 0 && (
        <p className="text-ink-2">
          {names(byHand)} {byHand.length > 1 ? "don't" : "doesn't"} let apps remove posts: delete it
          in the {names(byHand)} app.
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {removable.length > 0 && (
          <Button type="submit" variant="primary" disabled={pending}>
            {pending ? "Taking down…" : "Take down"}
          </Button>
        )}
        <Button type="button" variant="quiet" onClick={() => setAsking(false)}>
          {removable.length > 0 ? "Keep it" : "OK"}
        </Button>
        {state.error && (
          <span role="alert" className="text-danger">
            {state.error}
          </span>
        )}
      </div>
    </form>
  );
}
