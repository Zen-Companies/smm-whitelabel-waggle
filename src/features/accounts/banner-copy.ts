// The reconnect card's second line (design v3 "Reconnect banner · D"). Pure; tested.

/** "just now", "12 minutes ago", "3 hours ago", "2 days ago". */
export function timeAgo(iso: string, now = new Date()): string {
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / 60_000));
  const unit = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"} ago`;
  if (minutes < 1) return "just now";
  if (minutes < 60) return unit(minutes, "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return unit(hours, "hour");
  return unit(Math.floor(hours / 24), "day");
}

/**
 * The thin reconnect bar (design.md §4, T72): what stopped, since when, and what it costs.
 * "Instagram stopped connecting 2 days ago." + "3 messages are waiting there. It takes about 30
 * seconds to fix."
 */
export function reconnectBarCopy(input: {
  platform: string;
  waiting: number;
  disconnectedAt: string | null;
  now?: Date;
}): { headline: string; detail: string } {
  const since = input.disconnectedAt ? ` ${timeAgo(input.disconnectedAt, input.now)}` : "";
  const waiting =
    input.waiting === 0
      ? "New messages there wait until you reconnect."
      : input.waiting === 1
        ? "1 message is waiting there."
        : `${input.waiting} messages are waiting there.`;
  return {
    headline: `${input.platform} stopped connecting${since}.`,
    detail: `${waiting} It takes about 30 seconds to fix.`,
  };
}

/** "@handle · 2 messages waiting · disconnected 3 hours ago", leaving out what we don't know. */
export function disconnectedDetails(input: {
  username: string | null;
  waiting: number;
  disconnectedAt: string | null;
  now?: Date;
}): string {
  return [
    input.username ? `@${input.username}` : null,
    input.waiting > 0 ? `${input.waiting} message${input.waiting === 1 ? "" : "s"} waiting` : null,
    input.disconnectedAt ? `disconnected ${timeAgo(input.disconnectedAt, input.now)}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
