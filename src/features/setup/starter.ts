// First-time setup, "Get Waggle ready" (T73b; 5 steps approved 17 Nov): pure parts, tested.
// The steps themselves (labels, when each is done) are in ./checklist.

export const SETUP_LAST = 5;

/** 1..5 are the steps, 6 is "You're set up". */
export type SetupStepNumber = 1 | 2 | 3 | 4 | 5 | 6;

/** Pure: ?step= → 1..6, or null when the page should pick (the first step not done). */
export function parseStep(v: unknown): SetupStepNumber | null {
  if (typeof v !== "string") return null;
  const n = Number(v);
  return n >= 1 && n <= 6 && Number.isInteger(n) ? (n as SetupStepNumber) : null;
}

/** The kinds of business offered in step 1, each with the three questions it gets most. */
export const BUSINESS_KINDS = [
  {
    key: "food",
    label: "Café or restaurant",
    questions: ["When are you open?", "Do you take reservations?", "Do you deliver?"],
  },
  {
    key: "beauty",
    label: "Salon, spa or barber",
    questions: ["When are you open?", "How do I book?", "How much is a haircut?"],
  },
  {
    key: "shop",
    label: "Shop",
    questions: ["When are you open?", "Do you ship?", "Is this in stock?"],
  },
  {
    key: "realestate",
    label: "Real estate",
    questions: ["When are you open?", "Can I book a showing?", "What areas do you cover?"],
  },
  {
    key: "fitness",
    label: "Gym or studio",
    questions: ["When are you open?", "How much is a membership?", "Can I try a class first?"],
  },
  {
    key: "services",
    label: "Home or local services",
    questions: ["When are you open?", "What areas do you cover?", "How do I get a quote?"],
  },
  {
    key: "other",
    label: "Something else",
    questions: ["When are you open?", "Where are you?", "How do I buy or book?"],
  },
] as const;

export type BusinessKind = (typeof BUSINESS_KINDS)[number]["key"];

export function kindOf(key: unknown): (typeof BUSINESS_KINDS)[number] | null {
  return BUSINESS_KINDS.find((k) => k.key === key) ?? null;
}

/** The kind the saved description starts with, if it was written by this setup. */
export function kindFromProfile(profile: string): (typeof BUSINESS_KINDS)[number] | null {
  const first = profile.split("\n")[0]?.replace(/\.$/, "").trim();
  return BUSINESS_KINDS.find((k) => k.label === first) ?? null;
}

/** Pure: the business description Waggle sorts messages with (kind first, then their words). */
export function profileText(kindKey: string, description: string, max: number): string {
  const kind = kindOf(kindKey);
  const words = description.trim().replace(/\s+\n/g, "\n");
  const text = kind ? `${kind.label}.\n${words}`.trim() : words;
  return text.slice(0, max);
}

/** Pure: "Instagram and Facebook", "Instagram, Facebook and TikTok". */
export function listWords(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/** The "You're set up" line. */
export function doneLine(input: {
  accounts: string[];
  answers: number;
  replyOnItsOwn: boolean;
}): string {
  const watching = input.accounts.length
    ? `Waggle is watching ${listWords(input.accounts)}.`
    : "Connect an account in Settings so Waggle can start.";
  const ofYour =
    input.answers === 0
      ? "one of your answers"
      : input.answers === 1
        ? "your question"
        : `one of your ${input.answers} questions`;
  const then = input.replyOnItsOwn
    ? `The next time someone asks ${ofYour}, Waggle answers on its own.`
    : `The next time someone asks ${ofYour}, a reply will be waiting for your OK.`;
  return `${watching} ${then}`;
}
