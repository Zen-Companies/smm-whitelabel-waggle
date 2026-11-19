// First connect, "Here's what you've been missing" (canvas board approved 20 Nov): the words and
// choices the screens make, pure so they're tested without the engine. Types only from the
// contract (reveal-data.ts is server-only, so its constants are mirrored here).

import type { CatchUpPhase, CatchUpProgress, RevealData } from "./reveal-data";

/** Mirrors SORT_CAP in reveal-data.ts (server-only): counts above it read "500+". */
export const SORT_CAP_SHOWN = 500;

const HOUR_MS = 60 * 60 * 1000;

/** Pure: "1 comment" / "3 comments". */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Pure: a counter's number. Above the sort cap it reads "500+". When the catch-up was capped, a
 * sorted count (waiting) is a floor, so it reads "37+".
 */
export function formatCount(n: number, opts: { capped?: boolean; sorted?: boolean } = {}): string {
  const whole = Math.max(0, Math.floor(n));
  if (whole > SORT_CAP_SHOWN) return `${SORT_CAP_SHOWN}+`;
  if (opts.capped && opts.sorted) return `${whole}+`;
  return whole.toLocaleString("en-US");
}

/** Pure: "@harbourbean", or "your Instagram" when the handle isn't known yet. */
export function atHandle(handle: string | null, platformName: string): string {
  const name = (handle ?? "").trim().replace(/^@+/, "");
  if (!name) return `your ${platformName}`;
  return /\s/.test(name) ? name : `@${name}`;
}

/** The reading screen's progress bar, by phase (0–100). */
export function phaseProgress(phase: CatchUpPhase): number {
  switch (phase) {
    case "reading":
      return 30;
    case "sorting":
      return 60;
    case "drafting":
      return 85;
    case "ready":
      return 100;
  }
}

/** Pure: the line under the progress bar. */
export function phaseLine(phase: CatchUpPhase, platform: string): string {
  switch (phase) {
    case "reading":
      return platform === "facebook"
        ? "Reading comments · then messages · then reviews"
        : "Reading comments · then messages";
    case "sorting":
      return "Sorting questions, leads and spam";
    case "drafting":
      return "Writing your first replies";
    case "ready":
      return "Done reading";
  }
}

/**
 * Pure: whether a counter is still moving. Comments and messages are found while reading;
 * "still waiting" is known once sorting is over.
 */
export function stillCounting(phase: CatchUpPhase, counter: "found" | "waiting"): boolean {
  if (counter === "found") return phase === "reading";
  return phase === "reading" || phase === "sorting";
}

/** Pure: the three counters on "Reading your inbox…". */
export function readingCounters(p: CatchUpProgress): {
  key: "comments" | "messages" | "waiting";
  value: string;
  label: string;
  note: string | null;
}[] {
  const found = stillCounting(p.phase, "found") ? "still counting…" : null;
  return [
    {
      key: "comments",
      value: formatCount(p.commentsFound),
      label: p.commentsFound === 1 ? "comment found" : "comments found",
      note: found,
    },
    // Never a misleading "0 messages" when Waggle can't see them.
    p.dmAccessMissing
      ? { key: "messages", value: "—", label: "messages", note: "Waggle can’t see them yet" }
      : {
          key: "messages",
          value: formatCount(p.messagesFound),
          label: p.messagesFound === 1 ? "message found" : "messages found",
          note: found,
        },
    {
      key: "waiting",
      value: formatCount(p.waiting, { capped: p.capped, sorted: true }),
      label: "still waiting for a reply",
      note: stillCounting(p.phase, "waiting") ? "still counting…" : null,
    },
  ];
}

const lowerFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);

/** Pure: the reveal's breakdown chips, biggest first as on the board, zeros left out. */
export function breakdownChips(b: RevealData["breakdown"], withItems = true): string[] {
  const items = b.priceItems
    .filter((i) => i.item.trim())
    .slice(0, 3)
    .map((i) => lowerFirst(i.item.trim()));
  const chips: string[] = [];
  if (b.price > 0) {
    chips.push(
      `${b.price} asked about price${withItems && items.length ? ` (${items.join(", ")})` : ""}`,
    );
  }
  if (b.booking > 0) chips.push(`${b.booking} ready to book`);
  if (b.hours > 0) chips.push(`${b.hours} about hours`);
  if (b.otherQuestions > 0)
    chips.push(plural(b.otherQuestions, "other question", "other questions"));
  if (b.complaints > 0) chips.push(plural(b.complaints, "complaint", "complaints"));
  if (b.reviewsUnanswered > 0) {
    chips.push(plural(b.reviewsUnanswered, "review with no reply", "reviews with no reply"));
  }
  return chips;
}

/** Pure: "Not counted: 41 nice comments and friend tags, 9 spam." or "" when nothing was left out. */
export function notCountedLine(n: RevealData["notCounted"]): string {
  const parts: string[] = [];
  if (n.praiseAndTags > 0) {
    parts.push(
      plural(n.praiseAndTags, "nice comment or friend tag", "nice comments and friend tags"),
    );
  }
  if (n.spam > 0) parts.push(`${n.spam} spam`);
  return parts.length ? `Not counted: ${parts.join(", ")}.` : "";
}

/** Pure: "has been waiting 9 days" (only ever about a comment). */
export function waitingFor(days: number): string {
  const d = Math.floor(days);
  if (d < 1) return "has been waiting since today";
  return `has been waiting ${plural(d, "day", "days")}`;
}

/** Pure: a countdown pill, "3 h left" / "40 min left", or null once the window has closed. */
export function timeLeft(expiresAt: string, now: Date): string | null {
  const ms = Date.parse(expiresAt) - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return null;
  if (ms < HOUR_MS) return `${Math.max(1, Math.floor(ms / 60000))} min left`;
  return `${Math.floor(ms / HOUR_MS)} h left`;
}

export type RevealState =
  /** No catch-up for this brand (nothing connected yet, or before the engine). */
  | "none"
  /** Still reading, sorting or drafting: the live counters. */
  | "reading"
  /** Nobody waiting: "You're all caught up" (never "0 missed"). */
  | "quiet"
  /** People waited but there are no answers to draft from. */
  | "no-answers"
  /** The full reveal. */
  | "full";

/** Pure: which reveal to show. */
export function revealState(data: RevealData | null, answers: number): RevealState {
  if (!data) return "none";
  if (data.progress.phase !== "ready") return "reading";
  if (data.waiting <= 0) return "quiet";
  if (data.draftsReady <= 0 && answers <= 0) return "no-answers";
  return "full";
}

/** Pure: "4 of these expire today" (the board's heading), or "1 of these expires today". */
export function expiringTitle(n: number): string {
  return n === 1 ? "1 of these expires today" : `${n} of these expire today`;
}

/** Pure: "19 older messages · missed". */
export function missedTitle(n: number): string {
  return `${plural(n, "older message", "older messages")} · missed`;
}

/** Pure: "20 drafts ready · one tap each · nothing is sent without you". */
export function draftsLine(n: number): string {
  return `${plural(n, "draft", "drafts")} ready · one tap each · nothing is sent without you`;
}

/** Today's catch-up card while reading and when ready (board #18). */
export function todayCatchUpCopy(input: {
  phase: CatchUpPhase;
  handle: string;
  waiting: number;
  draftsReady: number;
}): { title: string; line: string; link: string } {
  if (input.phase !== "ready") {
    return {
      title: `Waggle is catching up on ${input.handle}`,
      line: "Reading your last 30 days. It takes about two minutes, and you can keep going.",
      link: "Watch it read",
    };
  }
  const waited =
    input.waiting > 0
      ? `${plural(input.waiting, "customer", "customers")} waited; ${plural(input.draftsReady, "reply is", "replies are")} drafted.`
      : "Nobody’s waiting right now.";
  return {
    title: "Your inbox catch-up is ready",
    line: `You left while Waggle was reading. ${waited}`,
    link: "See what you missed",
  };
}
