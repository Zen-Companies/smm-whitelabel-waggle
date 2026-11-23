// Step 2 plays like a story (board "Step 2 plays like a story, then shows everything", approved
// 23 Nov): a few scenes, about 5 s each, then the whole picture with one choice. Which scenes play,
// and how the player moves (tick, pause, Skip, Watch again), as pure functions. Client-safe.

export const SCENES = ["reading", "days", "locked", "answerable", "wanted", "summary"] as const;
export type Scene = (typeof SCENES)[number];

/** How long a scene stays before the next one. */
export const SCENE_MS = 5000;
/** Once the reading is done, its scene stays this long more (the bee lands), then moves on. */
export const READ_TAIL_MS = 1500;
/** How often the player's clock ticks. */
export const TICK_MS = 100;

export interface StoryFacts {
  /** Waggle is reading right now (the reading scene plays first and holds until done). */
  reading: boolean;
  /** Waggle read (or is reading) this account's last 30 days. */
  read: boolean;
  /** The account was read before: no story, the summary says so. */
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
  /** Anything to show in "What they wanted" (topics or chats). */
  wanted: boolean;
}

/** Locked DMs get a scene (and the red card) only where Meta's rule applies and DMs were read. */
export const showsLocked = (f: StoryFacts): boolean => f.pastDms && !f.dmAccessMissing;

/** The scenes that play, in order; the summary is always last. */
export function storyScenes(f: StoryFacts): Scene[] {
  if (f.readBefore || !f.read) return ["summary"];
  const list: Scene[] = [];
  if (f.reading) list.push("reading");
  list.push("days");
  if (showsLocked(f) && f.locked > 0) list.push("locked");
  if (f.dmsOpen + f.commentsOpen > 0) list.push("answerable");
  if (f.wanted) list.push("wanted");
  list.push("summary");
  return list;
}

/**
 * The scene showing: `at` if it's still in the list, else the next one after it (a refresh can
 * change the list: the reading ends, a number becomes 0), else the summary.
 */
export function currentScene(scenes: readonly Scene[], at: Scene): Scene {
  if (scenes.includes(at)) return at;
  const order = SCENES.indexOf(at);
  return scenes.find((s) => SCENES.indexOf(s) > order) ?? "summary";
}

export function nextScene(scenes: readonly Scene[], at: Scene): Scene {
  const cur = currentScene(scenes, at);
  const i = scenes.indexOf(cur);
  return scenes[i + 1] ?? "summary";
}

export const sceneMs = (s: Scene): number => (s === "reading" ? READ_TAIL_MS : SCENE_MS);

export interface StoryState {
  at: Scene;
  /** Time spent on the current scene. */
  elapsed: number;
  paused: boolean;
  /** The owner tapped Watch again (it plays even with reduced motion). */
  replayed: boolean;
}

export type StoryAction =
  /** The clock: `holding` while the reading scene waits for Waggle to finish reading. */
  | { type: "tick"; ms: number; scenes: readonly Scene[]; holding: boolean }
  | { type: "toggle" }
  | { type: "pause" }
  | { type: "skip" }
  | { type: "replay"; scenes: readonly Scene[] };

export function startStory(scenes: readonly Scene[], atSummary: boolean): StoryState {
  return { at: atSummary ? "summary" : scenes[0], elapsed: 0, paused: false, replayed: false };
}

export function storyStep(state: StoryState, action: StoryAction): StoryState {
  switch (action.type) {
    case "tick": {
      const at = currentScene(action.scenes, state.at);
      if (state.paused || at === "summary") return state;
      if (action.holding && at === "reading") return state;
      const elapsed = (at === state.at ? state.elapsed : 0) + action.ms;
      if (elapsed < sceneMs(at)) return { ...state, at, elapsed };
      return { ...state, at: nextScene(action.scenes, at), elapsed: 0 };
    }
    case "toggle":
      return state.at === "summary" ? state : { ...state, paused: !state.paused };
    case "pause":
      return state.paused ? state : { ...state, paused: true };
    case "skip":
      return { ...state, at: "summary", elapsed: 0, paused: false };
    case "replay":
      return { at: action.scenes[0], elapsed: 0, paused: false, replayed: true };
  }
}

/** How full each scene's bar is (0–1), the summary left out. */
export function storyBars(
  scenes: readonly Scene[],
  state: StoryState,
  readingShare: number,
): number[] {
  const at = currentScene(scenes, state.at);
  const shown: Scene[] = scenes.filter((s) => s !== "summary");
  const i = shown.indexOf(at);
  return shown.map((s, k) => {
    if (at === "summary" || k < i) return 1;
    if (k > i) return 0;
    if (s === "reading") return Math.min(1, Math.max(0, readingShare));
    return Math.min(1, state.elapsed / sceneMs(s));
  });
}

/** "the 4 and the 23": the numbers Waggle can take care of now (the ones above 0). */
export function careNumbers(counts: readonly number[]): string {
  const parts = counts.filter((n) => n > 0).map((n) => `the ${n}`);
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}
