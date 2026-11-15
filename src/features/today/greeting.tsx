"use client";

import { useSyncExternalStore } from "react";
import { greetingFor } from "./today";

// The date and "Good morning" follow the viewer's own clock, which only the browser knows. The
// server render says "Hello"; the browser fills in the rest (no hydration mismatch).

const noop = () => () => {};
const useIsClient = () =>
  useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );

export function TodayDate() {
  const client = useIsClient();
  if (!client) return <>&nbsp;</>;
  return (
    <>
      {new Date().toLocaleDateString(undefined, {
        weekday: "long",
        month: "long",
        day: "numeric",
      })}
    </>
  );
}

export function Greeting({ name }: { name: string | null }) {
  const client = useIsClient();
  const hello = client ? greetingFor(new Date().getHours()) : "Hello";
  return <>{name ? `${hello}, ${name}` : hello}</>;
}

/** "Tomorrow, 9:00 AM" / "Sat, Nov 21, 9:00 AM" in the viewer's own time zone. */
export function LocalWhen({ iso }: { iso: string }) {
  const client = useIsClient();
  if (!client) return <span>…</span>;
  const d = new Date(iso);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  const day =
    d.toDateString() === today.toDateString()
      ? "Today"
      : d.toDateString() === tomorrow.toDateString()
        ? "Tomorrow"
        : d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  return <time dateTime={iso}>{`${day}, ${time}`}</time>;
}
