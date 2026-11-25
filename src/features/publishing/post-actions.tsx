"use client";

import { useActionState, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  cancelPost,
  fixPostText,
  movePostAction,
  retryPost,
  takeDown,
  type FixTextState,
  type PostActionState,
  type TakeDownState,
} from "./actions";
import { platformLabel } from "@/lib/social/platforms";
import type { BestChip } from "./best-chips";
import { DateTimePicker, PickerShell } from "./date-time-picker";
import { liveEditNote, liveEditSplit } from "./live-edit";
import { POST_TEXT_MAX } from "./limits";
import { dayKeyIn, fromWallClock, shortWhen, wallClockIn } from "./post-time";
import { takeDownSplit } from "./take-down";

/** What the picker needs from the page: the viewer's zone, best times and busy days. */
export interface PickerContext {
  timeZone: string;
  chips: BestChip[] | null;
  busyDays: string[];
}

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

/**
 * Retry now, or pick a new time (posts that failed during a pause must be rescheduled). Round 3:
 * the new time comes from Waggle's own picker.
 */
export function RetryPostForm({
  postId,
  label,
  canPickTime = true,
  picker,
}: {
  postId: string;
  label: string;
  /** False once the post is live on some accounts: only the failed ones are tried, now. */
  canPickTime?: boolean;
  picker: PickerContext;
}) {
  const [state, action, pending] = useActionState<PostActionState, FormData>(retryPost, {});
  const [picking, setPicking] = useState(false);
  const [, startTransition] = useTransition();
  const today = dayKeyIn(new Date(), picker.timeZone);
  const [tomorrow] = useState(() =>
    dayKeyIn(new Date(Date.now() + 24 * 3_600_000), picker.timeZone),
  );
  return (
    <div className="flex w-full flex-col gap-2">
      <form action={action} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="postId" value={postId} />
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : label}
        </Button>
        {canPickTime && !picking && (
          <Button type="button" variant="quiet" onClick={() => setPicking(true)}>
            Pick a time
          </Button>
        )}
        {state.error && !picking && (
          <span role="alert" className="text-danger text-sm">
            {state.error}
          </span>
        )}
      </form>
      {picking && (
        <PickerShell placement="inline" onDismiss={() => setPicking(false)} label="Pick a new time">
          <DateTimePicker
            start={{ day: tomorrow, time: "09:00" }}
            today={today}
            timeZone={picker.timeZone}
            chips={picker.chips}
            busyDays={picker.busyDays}
            verb="Reschedule to"
            title="Pick a new time"
            pending={pending}
            onCancel={() => setPicking(false)}
            onPick={(day, time) => {
              const data = new FormData();
              data.set("postId", postId);
              data.set("scheduledFor", fromWallClock(day, time, picker.timeZone).toISOString());
              startTransition(() => action(data));
              setPicking(false);
            }}
          />
        </PickerShell>
      )}
    </div>
  );
}

/**
 * Move a planned post to another day and time (Posts Round 3, board 2b): the picker in place
 * (a sheet from the bottom on a phone), then "Moved to Thu 26 · 7:00 PM · Undo".
 */
export function MovePostButton({
  postId,
  scheduledFor,
  picker,
}: {
  postId: string;
  scheduledFor: string;
  picker: PickerContext;
}) {
  const [picking, setPicking] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [moved, setMoved] = useState<{ from: string; to: string } | null>(null);
  const today = dayKeyIn(new Date(), picker.timeZone);
  const move = (to: string, then: (r: { scheduledFor?: string }) => void) =>
    startTransition(async () => {
      setError(null);
      const r = await movePostAction({ postId, scheduledFor: to });
      if (r.error) setError(r.error);
      else then(r);
    });
  const label = (iso: string) => {
    const w = wallClockIn(iso, picker.timeZone);
    return shortWhen(w.day, w.time);
  };
  return (
    <>
      {!picking && (
        <Button
          type="button"
          variant="secondary"
          onClick={() => setPicking(true)}
          disabled={pending}
        >
          Move
        </Button>
      )}
      {moved && !picking && (
        <p role="status" className="flex w-full flex-wrap items-center gap-2 text-sm">
          Moved to {label(moved.to)} ·
          <button
            type="button"
            className="action-link"
            disabled={pending}
            onClick={() => move(moved.from, () => setMoved(null))}
          >
            {pending ? "Undoing…" : "Undo"}
          </button>
        </p>
      )}
      {error && !picking && (
        <p role="alert" className="text-danger w-full text-sm">
          {error}
        </p>
      )}
      {picking && (
        <div className="w-full">
          <PickerShell
            placement="inline"
            onDismiss={() => setPicking(false)}
            label="Move this post"
          >
            <DateTimePicker
              start={wallClockIn(scheduledFor, picker.timeZone)}
              today={today}
              timeZone={picker.timeZone}
              chips={picker.chips}
              busyDays={picker.busyDays}
              verb="Move to"
              title="Move this post"
              pending={pending}
              error={error}
              onCancel={() => setPicking(false)}
              onPick={(day, time) => {
                const to = fromWallClock(day, time, picker.timeZone).toISOString();
                move(to, (r) => {
                  setMoved({ from: scheduledFor, to: r.scheduledFor ?? to });
                  setPicking(false);
                });
              }}
            />
          </PickerShell>
        </div>
      )}
    </>
  );
}

/**
 * Fix the text of a post that went out (Posts Round 3, decision 2): only the text, only where
 * the platform allows it. Where none does, the button stays off and says why.
 */
export function FixTextButton({
  postId,
  content,
  platforms,
}: {
  postId: string;
  content: string;
  /** The platforms the post is live on. */
  platforms: string[];
}) {
  const [state, action, pending] = useActionState<FixTextState, FormData>(fixPostText, {});
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(content);
  const { editable } = liveEditSplit(platforms);
  const note = liveEditNote(platforms);
  // The note sits on its own line under the post's buttons (board 3 and 3b).
  const noteLine = note ? (
    <p id={`fix-${postId}`} className="meta order-last w-full">
      {note}
    </p>
  ) : null;
  if (!editable.length) {
    return (
      <>
        <Button type="button" variant="secondary" disabled aria-describedby={`fix-${postId}`}>
          Fix the text
        </Button>
        {noteLine}
      </>
    );
  }
  if (!open) {
    return (
      <>
        <Button
          type="button"
          variant="secondary"
          onClick={() => setOpen(true)}
          aria-describedby={note ? `fix-${postId}` : undefined}
        >
          Fix the text
        </Button>
        {noteLine}
        {state.done && (
          <p role="status" className="w-full text-sm">
            {state.done}
          </p>
        )}
      </>
    );
  }
  return (
    <form
      action={action}
      className="border-line bg-surface flex w-full flex-col gap-2 rounded-xl border p-3"
    >
      <input type="hidden" name="postId" value={postId} />
      <label htmlFor={`fix-text-${postId}`} className="text-sm font-medium">
        The text
      </label>
      <textarea
        id={`fix-text-${postId}`}
        name="content"
        rows={4}
        maxLength={POST_TEXT_MAX}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="field min-h-24 py-3"
        required
      />
      <p className="meta">
        {note ?? `Fix the text changes it on ${editable.map(platformLabel).join(", ")}.`} The photo
        or video stays as it is.
      </p>
      {state.error && (
        <p role="alert" className="text-danger text-sm">
          {state.error}
        </p>
      )}
      {state.done && (
        <p role="status" className="text-sm">
          {state.done}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="submit"
          variant="primary"
          disabled={pending || !text.trim() || text.trim() === content.trim()}
        >
          {pending ? "Saving…" : "Save the text"}
        </Button>
        <Button type="button" variant="quiet" onClick={() => setOpen(false)}>
          {state.done ? "Close" : "Cancel"}
        </Button>
      </div>
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
