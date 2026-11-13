"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { addBookingAction, type BookingState } from "./actions";

/** The owner's own UTC offset, e.g. +08:00: the booking is in the time they see on their device. */
function browserOffset(): string {
  const minutes = -new Date().getTimezoneOffset();
  const sign = minutes >= 0 ? "+" : "-";
  const abs = Math.abs(minutes);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, "0")}:${String(abs % 60).padStart(2, "0")}`;
}

/** "Add to calendar" under a booking request (T81d): the owner adds it once they've confirmed. */
export function AddBooking({ itemId, defaultTitle }: { itemId: string; defaultTitle: string }) {
  const [state, action, pending] = useActionState<BookingState, FormData>(addBookingAction, {});
  if (state.done) {
    return (
      <p role="status" className="text-success text-sm font-medium">
        {state.done}
      </p>
    );
  }
  const err = (f: string) =>
    state.field === f && state.error ? (
      <span role="alert" className="text-danger text-sm">
        {state.error}
      </span>
    ) : null;
  return (
    <details className="border-line rounded-xl border px-4 py-3">
      <summary className="cursor-pointer text-sm font-medium">
        Add the booking to your calendar
      </summary>
      <form
        action={(fd) => {
          fd.set("offset", browserOffset());
          return action(fd);
        }}
        className="flex flex-col gap-3 pt-3"
      >
        <input type="hidden" name="itemId" value={itemId} />
        <label className="flex flex-col gap-1.5 text-sm font-medium">
          Name
          <input name="title" defaultValue={defaultTitle} className="field" required />
          {err("title")}
        </label>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Date
            <input name="date" type="date" className="field" required />
            {err("date")}
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Starts
            <input name="time" type="time" className="field" required />
            {err("time")}
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Minutes
            <input
              name="minutes"
              type="number"
              min={15}
              step={15}
              defaultValue={60}
              className="field w-28"
            />
            {err("minutes")}
          </label>
        </div>
        <p className="meta">
          Only once you&apos;ve agreed it with the customer. The time is in your device&apos;s time
          zone.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "Adding…" : "Add to calendar"}
          </Button>
          {state.error && !state.field && (
            <p role="alert" className="text-danger text-sm">
              {state.error}
            </p>
          )}
        </div>
      </form>
    </details>
  );
}
