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
