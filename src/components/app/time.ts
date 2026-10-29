/** "2:14 PM" today, "Yesterday", "Oct 28" this year, "Oct 28, 2025" otherwise. */
export function shortTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

export const clockTime = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

export const platformName = (p: string | null | undefined) =>
  p === "facebook" ? "Facebook" : "Instagram";

/** Day separator in a thread: "Today", "Yesterday", "Oct 28". */
export function dayLabel(iso: string, now = new Date()): string {
  return new Date(iso).toDateString() === now.toDateString() ? "Today" : shortTime(iso, now);
}
