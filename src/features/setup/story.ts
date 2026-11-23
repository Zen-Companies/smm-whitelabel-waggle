// Step 2 (board "Replica update", approved 23 Nov): the reading plays first while Waggle reads,
// then one Results card: red for the DMs Meta locked, green for what can still be answered, the
// places Waggle didn't check, and one question. Which parts show, and how the player moves from
// the reading to the results (tick, pause, Skip), as pure functions. Client-safe.

import { withAskFirstFloor } from "@/lib/ask-first";

export const SCENES = ["reading", "results"] as const;
export type Scene = (typeof SCENES)[number];

/** Once the reading is done, its scene stays this long more (the bee lands), then moves on. */
export const READ_TAIL_MS = 1500;
/** How often the player's clock ticks. */
export const TICK_MS = 100;

export interface StoryFacts {
  /** Waggle is reading right now (the reading scene plays first and holds until done). */
  reading: boolean;
  /** Waggle read (or is reading) this account's last 30 days. */
  read: boolean;
  /** The account was read before: no reading, the results say so. */
  readBefore: boolean;
  /** Instagram or Facebook: past DMs are read, and Meta's 24-hour rule locks old ones. */
  pastDms: boolean;
  /** Waggle couldn't see the DMs: nothing is said about locked ones. */
  dmAccessMissing: boolean;
  /** DMs past the 24-hour window (missed_messages). */
  locked: number;
  /** DMs still answerable: those closing today (Meta), or every open DM elsewhere. */
  dmsOpen: number;
  /** Comments with no reply. */
  commentsOpen: number;
  /** Reviews with no reply (Google Business). */
  reviewsOpen: number;
  /** Replies Waggle wrote that wait for the owner's OK. */
  replies: number;
  /** Customers Waggle couldn't answer on its own. */
  needYou: number;
}

/** The red band shows only where Meta's rule applies, DMs were read, and some got locked. */
export const showsLocked = (f: StoryFacts): boolean =>
  f.pastDms && !f.dmAccessMissing && f.locked > 0;

/**
 * The red band's spam note (23 Nov): every locked DM counts, spam too, and a small line says how
 * many of them looked like spam. Null when none did.
 */
export function lockedSpamLine(locked: number, spam: number): string | null {
  const n = Math.min(spam, locked);
  if (n <= 0) return null;
  if (locked === 1) return "This one looked like spam or a scam.";
  return `${n} of these looked like spam or a scam.`;
}

/** The scenes that play, in order; the results are always last. */
export function storyScenes(f: StoryFacts): Scene[] {
  if (f.readBefore || !f.read) return ["results"];
  return f.reading ? ["reading", "results"] : ["results"];
}

export type TileKind = "dms" | "comments" | "reviews";

export interface ResultTile {
  kind: TileKind;
  n: number;
  text: string;
  note: string | null;
}

/** The green band's tiles, in order, the empty ones left out. */
export function resultTiles(f: StoryFacts): ResultTile[] {
  const tiles: ResultTile[] = [];
  if (f.dmsOpen > 0) {
    const one = f.dmsOpen === 1;
    tiles.push(
      f.pastDms
        ? {
            kind: "dms",
            n: f.dmsOpen,
            text: one ? "DM that closes today" : "DMs that close today",
            note: `Answer before Meta locks ${one ? "it" : "them"}`,
          }
        : {
            kind: "dms",
            n: f.dmsOpen,
            text: one ? "DM with no reply" : "DMs with no reply",
            note: null,
          },
    );
  }
  if (f.commentsOpen > 0) {
    tiles.push({
      kind: "comments",
      n: f.commentsOpen,
      text: f.commentsOpen === 1 ? "comment with no reply" : "comments with no reply",
      note: "No time limit on these",
    });
  }
  if (f.reviewsOpen > 0) {
    tiles.push({
      kind: "reviews",
      n: f.reviewsOpen,
      text: f.reviewsOpen === 1 ? "review with no reply" : "reviews with no reply",
      note: null,
    });
  }
  return tiles;
}

/**
 * The Results card's footer (23 Nov) always shows, with Yes and "Skip for now": "answer" when
 * Waggle has replies or customers are still waiting to be answered, in every state (read now, read
 * before, locked, reviews); "setup" when there's nothing to answer, so Yes sets up how Waggle
 * answers new messages instead. Both Yes buttons open step 3's chat.
 */
export const resultsFooter = (f: StoryFacts): "answer" | "setup" =>
  f.replies > 0 || f.needYou > 0 || resultTiles(f).length > 0 ? "answer" : "setup";

/** The footer's copy for each case. */
export const RESULTS_FOOTER_COPY: Record<
  ReturnType<typeof resultsFooter>,
  { title: string; sub: string; yes: string }
> = {
  answer: {
    title: "Want to answer them now?",
    sub: "Waggle already wrote replies. You check them; nothing is sent without your OK.",
    yes: "Yes, answer them now",
  },
  setup: {
    title: "Nothing to answer from the last 30 days.",
    sub: "Set up how Waggle answers new messages?",
    yes: "Yes, set it up",
  },
};

/**
 * "Skip for now" on the Results card (23 Nov) finishes setup without step 3: replies wait for the
 * owner's OK ("Ask me first"), and the always-ask topics are the code safety floor for the kind
 * plus refunds and complaints; no topics of the owner's own.
 */
export function skipAnswersDefaults(kind: string | null): {
  mode: "approve";
  topics: string[];
} {
  return { mode: "approve", topics: withAskFirstFloor(["refunds"], kind) };
}

/** The green band's first line: "But you have Waggle now." only after a red band. */
export const answerableLine = (f: StoryFacts): string =>
  showsLocked(f)
    ? "But you have Waggle now. These you can still answer:"
    : "These you can still answer:";

/** Pure: when each band fades in (ms) after the red one, as the replica does. */
export function bandDelays(locked: boolean): { green: number; chips: number; ask: number } {
  const chips = locked ? 800 : 400;
  return { green: locked ? 500 : 0, chips, ask: chips + 300 };
}

/**
 * The scene showing: `at` if it's still in the list, else the results (a refresh can end the
 * reading).
 */
export function currentScene(scenes: readonly Scene[], at: Scene): Scene {
  return scenes.includes(at) ? at : "results";
}

export interface StoryState {
  at: Scene;
  /** Time spent on the current scene. */
  elapsed: number;
  paused: boolean;
}

export type StoryAction =
  /** The clock: `holding` while the reading scene waits for Waggle to finish reading. */
  | { type: "tick"; ms: number; scenes: readonly Scene[]; holding: boolean }
  | { type: "toggle" }
  | { type: "skip" };

export function startStory(scenes: readonly Scene[], atResults: boolean): StoryState {
  return { at: atResults ? "results" : scenes[0], elapsed: 0, paused: false };
}

export function storyStep(state: StoryState, action: StoryAction): StoryState {
  switch (action.type) {
    case "tick": {
      const at = currentScene(action.scenes, state.at);
      if (state.paused || at === "results") return { ...state, at };
      if (action.holding) return state;
      const elapsed = state.elapsed + action.ms;
      if (elapsed < READ_TAIL_MS) return { ...state, elapsed };
      return { ...state, at: "results", elapsed: 0 };
    }
    case "toggle":
      return state.at === "results" ? state : { ...state, paused: !state.paused };
    case "skip":
      return { ...state, at: "results", elapsed: 0, paused: false };
  }
}
