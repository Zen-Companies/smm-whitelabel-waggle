// Setup's words and small sums (Walter's flow, approved 20 Nov). Pure, tested.

export const plural = (n: number, one: string, many: string): string =>
  `${n} ${n === 1 ? one : many}`;

/** "Fresh" from the sign-up name, else the email's first part; never empty. */
export function firstNameOf(fullName: unknown, email: string | null | undefined): string {
  const full = typeof fullName === "string" ? fullName.trim() : "";
  return full.split(/\s+/)[0] || email?.split("@")[0] || "there";
}

/** Minutes for `queued` replies going out one every `spacingMs` on an account (at least 1). */
export function sendingMinutes(queued: number, spacingMs: number): number {
  return Math.max(1, Math.ceil((queued * spacingMs) / 60_000));
}

/** Decision 8: "Sending 14 replies, about 6 minutes. You can leave this page." */
export function sendingLine(count: number, spacingMs: number): string {
  if (count <= 1) return "Sending 1 reply. You can leave this page.";
  const m = sendingMinutes(count, spacingMs);
  return `Sending ${count} replies, about ${plural(m, "minute", "minutes")}. You can leave this page.`;
}

export interface BatchProgress {
  total: number;
  sent: number;
  /** Still waiting their turn (sending). */
  left: number;
  /** Couldn't go out (handed back to the owner). */
  failed: number;
}

/** A batch's progress from its items' real statuses (polled, no Realtime). */
export function batchProgress(statuses: readonly string[]): BatchProgress {
  let sent = 0;
  let left = 0;
  let failed = 0;
  for (const s of statuses) {
    if (s === "sent") sent += 1;
    else if (s === "sending") left += 1;
    else if (s === "failed" || s === "escalated" || s === "paused") failed += 1;
  }
  return { total: sent + left + failed, sent, left, failed };
}

/** "2 replies couldn't go out. They're in your Inbox." */
const failedLine = (failed: number): string =>
  `${plural(failed, "reply", "replies")} couldn’t go out. They’re in your Inbox.`;

/** The progress card's line under the bar. */
export function progressLine(p: BatchProgress, spacingMs: number, platform: string): string {
  if (p.left === 0) return p.failed ? failedLine(p.failed) : "All sent.";
  const m = sendingMinutes(p.left, spacingMs);
  return `One every ${Math.round(spacingMs / 1000)} seconds, so ${platform} doesn’t flag the account. About ${plural(m, "minute", "minutes")} left; you can go on.`;
}

/** "Can answer on its own: X of Y": replies the owner sent of those Waggle wrote. */
export function answerMeter(
  approved: number,
  total: number,
): {
  x: number;
  y: number;
  pct: number;
} {
  const y = Math.max(0, total);
  const x = Math.min(Math.max(0, approved), y);
  return { x, y, pct: y ? Math.round((100 * x) / y) : 0 };
}

/**
 * The reply split around the facts to highlight (found facts not checked yet, decision 7), in
 * order, each fact matched once per place it appears. No facts: the whole reply, unmarked.
 */
export function highlightParts(
  reply: string,
  facts: readonly string[],
): { text: string; mark: boolean }[] {
  const wanted = [...new Set(facts.map((f) => f.trim()).filter(Boolean))].sort(
    (a, b) => b.length - a.length,
  );
  if (!wanted.length) return [{ text: reply, mark: false }];
  const parts: { text: string; mark: boolean }[] = [];
  let i = 0;
  let plain = "";
  while (i < reply.length) {
    const hit = wanted.find((f) => reply.startsWith(f, i));
    if (hit) {
      if (plain) parts.push({ text: plain, mark: false });
      plain = "";
      parts.push({ text: hit, mark: true });
      i += hit.length;
    } else {
      plain += reply[i];
      i += 1;
    }
  }
  if (plain) parts.push({ text: plain, mark: false });
  return parts;
}

/** "DM · 17h left", "comment · sent", "comment". */
export function replyMeta(r: { kind: string; hoursLeft: number | null; status: string }): string {
  const kind = r.kind === "dm" ? "DM" : r.kind === "review" ? "review" : "comment";
  if (r.status === "sent") return `${kind} · sent`;
  if (r.status === "sending") return `${kind} · sending`;
  return r.hoursLeft !== null ? `${kind} · ${r.hoursLeft}h left` : kind;
}

/** "yesterday", "2 days", "today" for a lost DM's age. */
export function ageLabel(receivedAt: string, now: Date): string {
  const days = Math.floor((now.getTime() - Date.parse(receivedAt)) / (24 * 60 * 60 * 1000));
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days`;
}

/** The end of setup's list (board "Setup, start to finish", 23 Nov): what's done, in order. */
export function doneLines(input: {
  platforms: readonly string[];
  sending: BatchProgress;
  mode: "approve" | "auto";
  waiting: readonly { author: string; category: string | null }[];
}): string[] {
  const lines: string[] = [];
  if (input.platforms.length) lines.push(`${input.platforms.join(" and ")} connected`);
  // Only what really happened: sent (or still going) and, apart, what couldn't go out.
  const s = input.sending;
  if (s.left > 0) {
    const going = s.sent + s.left;
    lines.push(`${plural(going, "reply", "replies")} on ${going === 1 ? "its" : "their"} way`);
  } else if (s.sent > 0) {
    lines.push(`${plural(s.sent, "reply", "replies")} sent`);
  }
  if (s.failed > 0) lines.push(failedLine(s.failed));
  lines.push(input.mode === "auto" ? "Waggle replies on its own" : "Ask me first before sending");
  const w = input.waiting;
  if (w.length === 1) {
    lines.push(
      `${w[0].author}’s ${w[0].category === "complaint" ? "complaint" : "message"} is in your Inbox`,
    );
  } else if (w.length > 1) {
    lines.push(`${w.length} messages wait for you in your Inbox`);
  }
  return lines;
}
