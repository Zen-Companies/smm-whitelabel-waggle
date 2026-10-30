// "Get Waggle ready" (T36 item 7): the first-day checklist on /lab, from facts about
// the business. Shown until every step is done.

export const BASIC_TOPICS = 3;
export const PRACTICE_GOAL = 3;
export const ASK_FIRST_DAYS = 7;

export interface SetupFacts {
  accountsConnected: number;
  topics: number;
  hasProfile: boolean;
  tries: number;
  /** Days since the business signed up. */
  daysSinceSignup: number;
}

export interface SetupStep {
  key: "connect" | "basics" | "profile" | "practice" | "week";
  title: string;
  detail: string;
  done: boolean;
  action: { label: string; href: string } | null;
}

export function setupSteps(f: SetupFacts): SetupStep[] {
  const day = Math.min(ASK_FIRST_DAYS, Math.floor(f.daysSinceSignup) + 1);
  return [
    {
      key: "connect",
      title: "Connect Instagram or Facebook",
      detail: f.accountsConnected ? "Connected" : "So messages reach Waggle",
      done: f.accountsConnected > 0,
      action: f.accountsConnected ? null : { label: "Connect", href: "/settings?section=accounts" },
    },
    {
      key: "basics",
      title: "Add your basics",
      detail:
        f.topics >= BASIC_TOPICS
          ? `${f.topics} topics added`
          : `${f.topics} of ${BASIC_TOPICS}: hours, prices, how to buy or book`,
      done: f.topics >= BASIC_TOPICS,
      action:
        f.topics >= BASIC_TOPICS
          ? null
          : { label: "Add business info", href: "/knowledge-base?topic=new" },
    },
    {
      key: "profile",
      title: "Describe your business",
      detail: f.hasProfile ? "Written" : "A few sentences help it tell a question from a buyer",
      done: f.hasProfile,
      action: f.hasProfile ? null : { label: "Write it", href: "/settings?section=business" },
    },
    {
      key: "practice",
      title: `Try ${PRACTICE_GOAL} messages`,
      detail: `${Math.min(f.tries, PRACTICE_GOAL)} of ${PRACTICE_GOAL} · below`,
      done: f.tries >= PRACTICE_GOAL,
      action: null,
    },
    {
      key: "week",
      title: "Keep Ask me first on for a week",
      detail:
        f.daysSinceSignup >= ASK_FIRST_DAYS
          ? "Done: check Ready to reply on its own"
          : `Day ${day} of ${ASK_FIRST_DAYS} · you check every reply`,
      done: f.daysSinceSignup >= ASK_FIRST_DAYS,
      action: null,
    },
  ];
}

export const setupComplete = (steps: SetupStep[]) => steps.every((s) => s.done);
