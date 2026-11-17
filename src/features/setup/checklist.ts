// "Get Waggle ready" (approved 17 Nov, canvas "Onboarding · one Get Waggle ready"): the same five
// steps in setup, on top of Teach Waggle and on Today. Each is done by something real; pure, tested.

import type { State } from "@/components/app/state-mark";

export const TOP_ANSWERS = 3;
export const PRACTICE_GOAL = 3;

export interface ReadyFacts {
  /** The business description (step 1) is written. */
  hasProfile: boolean;
  /** Connected accounts that work. */
  accounts: number;
  /** Answers in Business info. */
  answers: number;
  /** Practice tries in the Lab. */
  tries: number;
  /** The owner chose how replies to questions go out (in setup or in How Waggle replies). */
  repliesChosen: boolean;
}

export type ReadyKey = "business" | "connect" | "answers" | "practice" | "replies";

export interface ReadyStep {
  key: ReadyKey;
  /** 1..5, also the setup step it opens. */
  n: 1 | 2 | 3 | 4 | 5;
  label: string;
  done: boolean;
  /** "Done", "1 of 3", "Not yet". */
  status: string;
  state: State;
}

function count(have: number, goal: number): Pick<ReadyStep, "done" | "status" | "state"> {
  if (have >= goal) return { done: true, status: "Done", state: "working" };
  if (have > 0) return { done: false, status: `${have} of ${goal}`, state: "waiting" };
  return { done: false, status: "Not yet", state: "off" };
}

const yesNo = (done: boolean): Pick<ReadyStep, "done" | "status" | "state"> =>
  done
    ? { done: true, status: "Done", state: "working" }
    : { done: false, status: "Not yet", state: "off" };

export function readySteps(f: ReadyFacts): ReadyStep[] {
  return [
    { key: "business", n: 1, label: "Your business", ...yesNo(f.hasProfile) },
    { key: "connect", n: 2, label: "Connect", ...yesNo(f.accounts > 0) },
    { key: "answers", n: 3, label: "Top answers", ...count(f.answers, TOP_ANSWERS) },
    {
      key: "practice",
      n: 4,
      label: `Try ${PRACTICE_GOAL} messages`,
      ...count(f.tries, PRACTICE_GOAL),
    },
    { key: "replies", n: 5, label: "How replies go out", ...yesNo(f.repliesChosen) },
  ];
}

export const readyDone = (steps: ReadyStep[]) => steps.filter((s) => s.done).length;

/** The first step not done yet, or null when Waggle is ready. */
export const nextReadyStep = (steps: ReadyStep[]): ReadyStep | null =>
  steps.find((s) => !s.done) ?? null;

/** Where Continue goes: back into setup at the next step. */
export const continueHref = (steps: ReadyStep[]): string => {
  const next = nextReadyStep(steps);
  return next ? `/setup?step=${next.n}` : "/today";
};

/** Audit actions that mean "the owner chose how replies to questions go out". */
export const REPLIES_CHOSEN_ACTION = "setup_replies_chosen";
