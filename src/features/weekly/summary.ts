import { z } from "zod";
import { setupTopic, TOPIC_LABEL, type SetupTopic } from "@/features/setup";
import type { WeekOutcome } from "./select";

// Weekly check-up (board "Your week", approved 26 Nov): the numbers stored with each run, so Today
// and the Monday email read them without any AI. Pure, tested.
//
// What Waggle has (inbound_items received in the week, including what this run added) is counted
// from the database; messages only the read saw (answered on the platform, too old to answer,
// praise) are counted from the run's tally. A message is in one or the other, never both.

/** A message's topic: setup's topics, plus praise ("Compliments") for counted-only messages. */
export type WeekTopic = SetupTopic | "praise";

const LABEL: Record<WeekTopic, string> = { ...TOPIC_LABEL, praise: "Compliments" };
const TOPICS_SHOWN = 5;

/** Waiting on Waggle or the owner. */
const OPEN = new Set([
  "new",
  "classified",
  "drafted",
  "awaiting_approval",
  "awaiting_draft",
  "escalated",
  "sending",
  "paused",
  "failed",
]);

/** One account's counted-only messages, kept on the run while it reads. */
export interface AccountTally {
  answeredByYou: number;
  tooOld: number;
  covered: number;
  noReplyNeeded: number;
  /** Added to the Inbox by this run (counted from the database, not again from here). */
  found: number;
  topics: Partial<Record<WeekTopic, number>>;
}

export const emptyTally = (): AccountTally => ({
  answeredByYou: 0,
  tooOld: 0,
  covered: 0,
  noReplyNeeded: 0,
  found: 0,
  topics: {},
});

/**
 * Adds one message's outcome. `topic` is for counted-only messages (what Waggle has gets its topic
 * from the database); praise is "Compliments" whatever is passed.
 */
export function addOutcome(
  tally: AccountTally,
  outcome: WeekOutcome,
  topic: WeekTopic | null,
): AccountTally {
  const next = { ...tally, topics: { ...tally.topics } };
  const counted = (t: WeekTopic | null) => {
    if (t) next.topics[t] = (next.topics[t] ?? 0) + 1;
  };
  if (outcome === "answered_by_you") {
    next.answeredByYou += 1;
    counted(topic);
  } else if (outcome === "too_old") {
    next.tooOld += 1;
    counted(topic);
  } else if (outcome === "covered") {
    next.covered += 1;
    counted(topic);
  } else if (outcome === "no_reply_needed") {
    next.noReplyNeeded += 1;
    counted("praise");
  } else if (outcome === "insert") {
    next.found += 1;
  }
  return next;
}

/** An item Waggle has from the week (any account of the business). */
export interface WeekItemRow {
  social_account_id: string;
  kind: string;
  status: string;
  category: string | null;
  text: string;
  /** DMs: when the platform's reply window closes (last customer message + window), else null. */
  dm_closes_at: string | null;
}

export type AccountState = "read" | "partial" | "failed" | "not_read";

export interface WeekAccount {
  id: string;
  platform: string;
  name: string;
  /**
   * read: comments and messages read; partial: something couldn't be read (DM access); failed:
   * couldn't read it (it needs reconnecting); not_read: nothing to read there (counted from what
   * Waggle has).
   */
  state: AccountState;
  reason: string | null;
}

const accountSchema = z.object({
  id: z.string(),
  platform: z.string(),
  name: z.string(),
  state: z.enum(["read", "partial", "failed", "not_read"]),
  reason: z.string().nullable(),
  count: z.number().int().nonnegative(),
});

const summarySchema = z.object({
  cameIn: z.number().int().nonnegative(),
  answeredByWaggle: z.number().int().nonnegative(),
  answeredByYou: z.number().int().nonnegative(),
  waiting: z.number().int().nonnegative(),
  closingToday: z.number().int().nonnegative(),
  found: z.number().int().nonnegative(),
  tooOld: z.number().int().nonnegative(),
  previousCameIn: z.number().int().nonnegative().nullable(),
  accounts: z.array(accountSchema),
  topics: z.array(z.object({ topic: z.string(), label: z.string(), count: z.number().int() })),
  gaps: z.array(z.object({ text: z.string(), times: z.number().int() })),
});

export type WeekSummary = z.infer<typeof summarySchema>;

/** A stored summary, or null when it isn't one (an older shape, a failed run). */
export function parseWeekSummary(raw: unknown): WeekSummary | null {
  const parsed = summarySchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

export function buildWeekSummary(input: {
  items: readonly WeekItemRow[];
  tally: Readonly<Record<string, AccountTally>>;
  accounts: readonly WeekAccount[];
  gaps: readonly { text: string; times: number }[];
  previousCameIn: number | null;
  now: Date;
  /** The business's next midnight: "DMs close today" are the waiting ones closing before it. */
  endOfToday: Date;
}): WeekSummary {
  const topics = new Map<WeekTopic, number>();
  const addTopic = (t: WeekTopic, n = 1) => topics.set(t, (topics.get(t) ?? 0) + n);
  const perAccount = new Map<string, number>();
  const addAccount = (id: string, n: number) => perAccount.set(id, (perAccount.get(id) ?? 0) + n);

  let byWaggle = 0;
  let byYou = 0;
  let waiting = 0;
  let closingToday = 0;
  for (const i of input.items) {
    addAccount(i.social_account_id, 1);
    if (i.status === "sent") byWaggle += 1;
    else if (i.status === "handled") byYou += 1;
    else if (OPEN.has(i.status)) {
      waiting += 1;
      const closes = i.dm_closes_at ? Date.parse(i.dm_closes_at) : NaN;
      if (i.kind === "dm" && closes > input.now.getTime() && closes <= input.endOfToday.getTime()) {
        closingToday += 1;
      }
    }
    if (i.status === "ignored" || i.category === "spam") continue;
    addTopic(setupTopic(i.text, i.category));
  }

  let counted = 0;
  let found = 0;
  let tooOld = 0;
  for (const [accountId, t] of Object.entries(input.tally)) {
    const only = t.answeredByYou + t.tooOld + t.covered + t.noReplyNeeded;
    counted += only;
    addAccount(accountId, only);
    byYou += t.answeredByYou;
    waiting += t.covered;
    found += t.found;
    tooOld += t.tooOld;
    for (const [topic, n] of Object.entries(t.topics) as [WeekTopic, number][]) addTopic(topic, n);
  }

  // Busiest first; a stable sort keeps the connect order between equals.
  const accounts = input.accounts
    .map((a) => ({ ...a, count: perAccount.get(a.id) ?? 0 }))
    .sort((a, b) => b.count - a.count);

  return {
    cameIn: input.items.length + counted,
    answeredByWaggle: byWaggle,
    answeredByYou: byYou,
    waiting,
    closingToday,
    found,
    tooOld,
    previousCameIn: input.previousCameIn,
    accounts,
    topics: [...topics.entries()]
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, TOPICS_SHOWN)
      .map(([topic, count]) => ({ topic, label: LABEL[topic], count })),
    gaps: input.gaps.map((g) => ({ text: g.text, times: g.times })),
  };
}
