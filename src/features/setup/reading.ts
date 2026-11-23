// Step 2's numbers while Waggle reads and once it has read (board "Setup, start to finish",
// approved 23 Nov), and whether the reading still looks alive. Pure, tested; client-safe (the
// catch-up copy module it uses is pure too).

import {
  formatCount,
  readingCounters,
  stillCounting,
} from "@/features/catch-up/first-connect-copy";
import type { CatchUpProgress } from "@/features/catch-up/reveal-data";

export interface SetupTile {
  key: string;
  value: string;
  label: string;
  note: string | null;
  /** Red only for a non-zero "no reply" once read. */
  tone: "plain" | "lost";
}

/**
 * While reading: the counters, all plain. "Still waiting" isn't known until the messages are
 * sorted, so it reads "–" and "known when sorted" until then.
 */
export function readingTiles(p: CatchUpProgress): SetupTile[] {
  return readingCounters(p).map((c) =>
    c.key === "waiting" && stillCounting(p.phase, "waiting")
      ? { key: c.key, value: "–", label: "still waiting", note: "known when sorted", tone: "plain" }
      : { ...c, tone: "plain" },
  );
}

/** Once read: comments, messages and no reply (red only when some got none). */
export function readTiles(input: {
  comments: number;
  messages: number;
  dmAccessMissing: boolean;
  noReply: number;
  capped: boolean;
}): { tiles: SetupTile[]; quiet: boolean } {
  const tiles: SetupTile[] = [
    {
      key: "comments",
      value: formatCount(input.comments),
      label: input.comments === 1 ? "comment" : "comments",
      note: null,
      tone: "plain",
    },
    input.dmAccessMissing
      ? {
          key: "messages",
          value: "—",
          label: "messages",
          note: "Waggle can’t see them yet",
          tone: "plain",
        }
      : {
          key: "messages",
          value: formatCount(input.messages),
          label: input.messages === 1 ? "message" : "messages",
          note: null,
          tone: "plain",
        },
    {
      key: "noReply",
      value: formatCount(input.noReply, { capped: input.capped, sorted: true }),
      label: "no reply",
      note: null,
      tone: input.noReply > 0 ? "lost" : "plain",
    },
  ];
  return { tiles, quiet: input.comments + input.messages + input.noReply === 0 };
}

/** No change in this long: the reading looks stuck, so the page says so (no endless spin). */
export const READING_STALL_MS = 5 * 60 * 1000;
/** Asks that failed in a row before the page says it can't check. */
export const READING_FAIL_LIMIT = 5;

export type ReadingHealth = "ok" | "stalled" | "offline";

/** Whether the reading still looks alive, from the polling so far. */
export function readingHealth(input: {
  failures: number;
  lastChangeAt: number;
  now: number;
}): ReadingHealth {
  if (input.failures >= READING_FAIL_LIMIT) return "offline";
  if (input.now - input.lastChangeAt >= READING_STALL_MS) return "stalled";
  return "ok";
}

/** "Writing replies · 2 of 5": the replies asked for and how many are written (or handed over). */
export function writingLine(w: { done: number; of: number }): string {
  return `Writing replies · ${Math.min(w.done, w.of)} of ${w.of}`;
}

/**
 * How long after a readable account's connect setup waits for its catch-up row before deciding
 * nothing will be read (the webhook upserts the account, then starts the catch-up).
 */
export const STARTING_READ_MS = 2 * 60 * 1000;

/**
 * "read": the brand has a catch-up. "before": the same real account was read before, elsewhere
 * (one read per account, ever). "starting": connected moments ago, its catch-up is on its way.
 * "none": nothing to read (or the read never started).
 */
export type ReadState = "read" | "before" | "starting" | "none";

/** Pure: where step 2's reading stands for the brand's readable account. */
export function readStateOf(input: {
  hasCatchUp: boolean;
  /** The brand's readable account, if any: whether it was read elsewhere, and when it connected. */
  account: { readElsewhere: boolean; connectedAt: string } | null;
  now: Date;
}): ReadState {
  if (input.hasCatchUp) return "read";
  const a = input.account;
  if (!a) return "none";
  if (a.readElsewhere) return "before";
  return input.now.getTime() - Date.parse(a.connectedAt) < STARTING_READ_MS ? "starting" : "none";
}
