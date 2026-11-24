// Setup, Walter's flow (approved 20 Nov; canvas "Setup steps 2 and 3, one screen at a time"):
// 1 Connect · 2 See what you missed · 3 Check Waggle's answers. Step 1 is /welcome; steps 2 and 3
// are short screens paged inside /setup, one idea each. Empty screens are skipped, Back keeps
// everything, and reopening setup lands on the screen the owner left. Pure, tested.

export const SETUP_SCREENS = [
  "name",
  "missed",
  "wanted",
  "replies",
  "money",
  "quick",
  "waiting",
  "how",
  "chat",
] as const;
export type SetupScreen = (typeof SETUP_SCREENS)[number];

export const isSetupScreen = (v: unknown): v is SetupScreen =>
  typeof v === "string" && (SETUP_SCREENS as readonly string[]).includes(v);

export const SETUP_STEPS = ["Connect", "See what you missed", "Check Waggle’s answers"] as const;
export type SetupStep = 1 | 2 | 3;

export const STEP_OF: Record<SetupScreen, 2 | 3> = {
  name: 2,
  missed: 2,
  wanted: 2,
  replies: 2,
  money: 3,
  quick: 3,
  waiting: 3,
  how: 3,
  chat: 3,
};

/** The line under the stepper: "What you missed · 2 of 3". */
export const STEP_SUBLABEL: Record<2 | 3, string> = {
  2: "What you missed",
  3: "Waggle’s answers",
};

/** What decides which screens have something to show. */
export interface FlowFacts {
  /** People who wanted to buy or order (2.2's big number). */
  wanted: number;
  /** DMs past the 24-hour window (2.2's list). */
  lostDms: number;
  /** Replies Waggle wrote that are ready to check (2.3). */
  drafted: number;
  /** Messages Waggle couldn't answer from what it knows (2.3's "N need you", 3.3). */
  needYou: number;
  /** Replies about buying, ordering and prices (3.1), sent or not. */
  money: number;
  /** Every other reply (3.2), sent or not. */
  quick: number;
}

/**
 * The screens to show, in order. Step 2 is one screen, "missed" (board "Step 2 plays like a
 * story", 23 Nov): its old parts "wanted" and "replies" are scenes in it now, and links to them
 * open it. Step 3 is one screen too, "chat" (board "Step 3 is a conversation with Waggle", 23
 * Nov): its old screens (money, quick, waiting, how) are questions in the thread, and links to
 * them open it. The facts no longer hide screens; each screen says what's empty in place.
 */
export function visibleScreens(f: FlowFacts): SetupScreen[] {
  // Kept for callers: no fact hides a screen any more (the name screen is gone, 24 Nov).
  void f;
  return ["missed", "chat"];
}

/**
 * Old screens and where they open now. "name" (step 2's business-name screen) is gone (24 Nov):
 * the name is confirmed in step 3's facts card, so old links and saved screens open step 2.
 */
const OPENS_AS: Partial<Record<SetupScreen, SetupScreen>> = {
  name: "missed",
  wanted: "missed",
  replies: "missed",
  money: "chat",
  quick: "chat",
  waiting: "chat",
  how: "chat",
};

/** The visible screen `from` opens as. */
function atOrAfter(from: SetupScreen, visible: SetupScreen[]): SetupScreen {
  const to = OPENS_AS[from] ?? from;
  return visible.includes(to) ? to : "chat";
}

/**
 * The screen to open: the one asked for (a link, Back/Next), else the one saved when the owner
 * left, else the first. A screen that is empty now opens the next one that isn't.
 */
export function openScreen(input: {
  requested: unknown;
  saved: unknown;
  facts: FlowFacts;
}): SetupScreen {
  const visible = visibleScreens(input.facts);
  if (isSetupScreen(input.requested)) return atOrAfter(input.requested, visible);
  if (isSetupScreen(input.saved)) return atOrAfter(input.saved, visible);
  return visible[0];
}

/** The screen after `current`, or null when setup is done. */
export function nextScreen(current: SetupScreen, f: FlowFacts): SetupScreen | null {
  const visible = visibleScreens(f);
  const at = SETUP_SCREENS.indexOf(current);
  return visible.find((s) => SETUP_SCREENS.indexOf(s) > at) ?? null;
}

/**
 * The screen before `current`, or null where the board has no Back: the first screen of each
 * step (step 2 starts the reveal; step 3 starts after the owner moved on, and sent replies stay
 * sent).
 */
export function previousScreen(current: SetupScreen, f: FlowFacts): SetupScreen | null {
  const visible = visibleScreens(f);
  const at = SETUP_SCREENS.indexOf(current);
  const before = visible.filter((s) => SETUP_SCREENS.indexOf(s) < at);
  const prev = before[before.length - 1];
  if (!prev || STEP_OF[prev] !== STEP_OF[current]) return null;
  return prev;
}

/** Where the screen sits in its step: "What you missed · 2 of 3" and the dots. */
export function stepPosition(
  current: SetupScreen,
  f: FlowFacts,
): { step: 2 | 3; index: number; count: number; sublabel: string } {
  const step = STEP_OF[current];
  const inStep = visibleScreens(f).filter((s) => STEP_OF[s] === step);
  return {
    step,
    index: inStep.indexOf(current) + 1,
    count: inStep.length,
    sublabel: STEP_SUBLABEL[step],
  };
}

/**
 * Which of the 3 steps are done (the stepper, and the line on Today and Teach Waggle): Connect
 * when an account is connected; See what you missed once the owner reached step 3; all once
 * finished.
 */
export function stepsDone(input: {
  connected: boolean;
  saved: unknown;
  finished: boolean;
}): [boolean, boolean, boolean] {
  const inStep3 = isSetupScreen(input.saved) && STEP_OF[input.saved] === 3;
  return [
    input.connected || input.finished,
    input.finished || (input.connected && inStep3),
    input.finished,
  ];
}

/** The first step not done (1–3), or null once setup is finished. */
export function currentStep(done: [boolean, boolean, boolean]): SetupStep | null {
  const i = done.findIndex((d) => !d);
  return i === -1 ? null : ((i + 1) as SetupStep);
}

/**
 * Where /setup opens: Connect (/welcome) until an account is connected, unless one is connecting
 * right now (the sign-in came back, it shows up in a moment). Old links (the 5-step setup's
 * `?step=`, the reveal, the gate's resume) land here too, so they all reach the new flow.
 */
export function setupEntry(input: {
  connected: boolean;
  connecting: boolean;
}): "welcome" | "setup" {
  return input.connected || input.connecting ? "setup" : "welcome";
}
