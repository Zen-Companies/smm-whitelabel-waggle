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

/**
 * The kinds of business offered in step 1, each with the three questions it gets most (suggested
 * in step 3, each one editable) and a few more people ask ("More people ask", approved 17 Nov).
 */
export const BUSINESS_KINDS = [
  {
    key: "food",
    label: "Café or restaurant",
    questions: ["When are you open?", "Do you take reservations?", "Do you deliver?"],
    more: ["Is there parking?", "Do you have vegan options?", "Can I order ahead?"],
  },
  {
    key: "beauty",
    label: "Salon, spa or barber",
    questions: ["When are you open?", "How do I book?", "How much is a haircut?"],
    more: ["Do you take walk-ins?", "What products do you use?", "Can I move my booking?"],
  },
  {
    key: "shop",
    label: "Shop",
    questions: ["When are you open?", "Do you ship?", "Is this in stock?"],
    more: [
      "What is your return policy?",
      "Do you have this in another size?",
      "Can I pick it up in store?",
    ],
  },
  {
    key: "realestate",
    label: "Real estate",
    questions: ["When are you open?", "Can I book a showing?", "What areas do you cover?"],
    more: ["How much is my home worth?", "Do you handle rentals?", "What are your fees?"],
  },
  {
    key: "fitness",
    label: "Gym or studio",
    questions: ["When are you open?", "How much is a membership?", "Can I try a class first?"],
    more: [
      "Do you have a class schedule?",
      "Is there a joining fee?",
      "Do you offer personal training?",
    ],
  },
  {
    key: "services",
    label: "Home or local services",
    questions: ["When are you open?", "What areas do you cover?", "How do I get a quote?"],
    more: ["How soon can you come?", "Are you licensed and insured?", "Do you work weekends?"],
  },
  {
    // Clinic or health (board "Step 3 is a conversation with Waggle", 23 Nov): medical questions
    // always come to the owner (the ask-first floor).
    key: "health",
    label: "Clinic or health",
    questions: [
      "When are you open?",
      "How do I book an appointment?",
      "How much is a consultation?",
    ],
    more: ["Do you accept my HMO or insurance?", "Where are you?", "Do you take walk-ins?"],
  },
  {
    key: "other",
    label: "Something else",
    questions: ["When are you open?", "Where are you?", "How do I buy or book?"],
    more: ["How much does it cost?", "How long does it take?", "Can I pay by card?"],
  },
] as const;

export type BusinessKind = (typeof BUSINESS_KINDS)[number]["key"];

export function kindOf(key: unknown): (typeof BUSINESS_KINDS)[number] | null {
  return BUSINESS_KINDS.find((k) => k.key === key) ?? null;
}

/**
 * The category a page states (Facebook Page category, Google Business primary category) → our
 * kind (setup item G, 23 Nov), so step 3 needn't ask. First match wins, most specific first:
 * health before beauty ("Medical Spa"), beauty before shop ("Barber Shop"), services before food
 * and shop ("Auto Repair Shop"), food before shop ("Coffee Shop"). "Home or local services" means
 * trades and home services; anything else (photographers, schools, agencies, "Local Business")
 * gives null and setup asks. Pure, tested.
 */
/** A whole-word, case-blind pattern (letters in any script count as word letters: "Café"). */
const words = (alternatives: string) =>
  new RegExp(String.raw`(?<![\p{L}\p{N}])(?:${alternatives})(?![\p{L}\p{N}])`, "iu");

/** Facebook umbrella categories that could be either of two kinds: setup asks. */
const AMBIGUOUS_CATEGORY = /^health\s*\/\s*beauty$/i;

const CATEGORY_KINDS: readonly (readonly [BusinessKind, RegExp])[] = [
  [
    "health",
    words(
      String.raw`(dent(ist|al)|orthodont\w*|doctor|physician|clinic|medical|hospital|health|physiotherap\w*|physical therap\w*|chiropract\w*|optometr\w*|optician|eye care|pharmac\w*|pediatric\w*|dermatolog\w*|psycholog\w*|psychiatr\w*|veterinar\w*|nurs(e|ing)|laborator\w*|diagnostic\w*)`,
    ),
  ],
  [
    "beauty",
    words(
      String.raw`(salon|spa|barber\w*|beauty|beautician|nails?|hair\w*|cosmetic\w*|make-?up|lash(es)?|brows?|waxing|tattoo\w*|massage|skin ?care|esthetician)`,
    ),
  ],
  [
    "fitness",
    words(
      String.raw`(gym|fitness|yoga|pilates|crossfit|martial arts?|boxing|dance studio|personal trainer|sports club|bootcamp|cycling studio)`,
    ),
  ],
  [
    "realestate",
    words(String.raw`(real estate|realtor|realty|property|properties|apartment rental|brokerage)`),
  ],
  [
    "services",
    words(
      String.raw`(plumb\w*|electrician|electrical|hvac|heating|air condition\w*|roof\w*|contractor|construction|clean(ing|ers?)|janitorial|landscap\w*|lawn|gardener|locksmith|pest control|exterminator|mov(ing|ers?)|handyman|paint(er|ing)|carpent\w*|repair\w*|mechanic|auto(motive)? (service|repair)|car wash|towing|pool (service|cleaning)|flooring|renovation|remodel\w*|home improvement|appliance|window|solar|glass|welding|masonry|fencing|pressure washing)`,
    ),
  ],
  [
    "food",
    words(
      String.raw`(restaurant|caf[eé]|coffee|bakery|baker|bakeshop|bar|pub|pizz\w*|bistro|food|catering|caterer|diner|deli|brewery|winery|juice|tea ?(room|house|shop)|dessert|ice cream|donuts?|doughnuts?|patisserie|p[aâ]tisserie|grill|sushi|burgers?|steakhouse|eatery|noodle\w*|ramen|taqueria|barbecue|bbq|cake\w*|chocolate\w*|food truck)`,
    ),
  ],
  [
    "shop",
    words(
      String.raw`(shop|store|boutique|retail\w*|clothing|apparel|fashion|jewel\w*|florist|flowers?|gifts?|book ?store|supermarket|grocery|market|furniture|electronics|shoes?|pet supply|toys?|e-?commerce|merchandise)`,
    ),
  ],
];

export function kindFromPlatformCategory(category: string | null | undefined): BusinessKind | null {
  const c = (category ?? "").replace(/\s+/g, " ").trim();
  if (!c || AMBIGUOUS_CATEGORY.test(c)) return null;
  return CATEGORY_KINDS.find(([, re]) => re.test(c))?.[0] ?? null;
}

const OTHER_PREFIX = "Something else: ";
/** "What kind, in a few words?" when Something else is picked. */
export const CUSTOM_KIND_MAX = 60;

function firstLine(profile: string): string {
  return (profile.split("\n")[0] ?? "").replace(/\.$/, "").trim();
}

/** The kind the saved description starts with, if it was written by this setup. */
export function kindFromProfile(profile: string): (typeof BUSINESS_KINDS)[number] | null {
  const first = firstLine(profile);
  if (first.startsWith(OTHER_PREFIX)) return kindOf("other");
  return BUSINESS_KINDS.find((k) => k.label === first) ?? null;
}

/** Pure: what the owner typed for Something else ("Dog grooming"), or "". */
export function customKindFromProfile(profile: string): string {
  const first = firstLine(profile);
  return first.startsWith(OTHER_PREFIX) ? first.slice(OTHER_PREFIX.length).trim() : "";
}

/** Pure: the business description Waggle sorts messages with (kind first, then their words). */
export function profileText(
  kindKey: string,
  description: string,
  max: number,
  custom = "",
): string {
  const kind = kindOf(kindKey);
  const words = description.trim().replace(/\s+\n/g, "\n");
  const what = custom.replace(/\s+/g, " ").trim().replace(/\.+$/, "").slice(0, CUSTOM_KIND_MAX);
  const label = kind?.key === "other" && what ? `${OTHER_PREFIX}${what}` : kind?.label;
  const text = label ? `${label}.\n${words}`.trim() : words;
  return text.slice(0, max);
}

/** Step 3 takes at most this many questions at once; more can be added in Teach Waggle. */
export const SETUP_QUESTIONS_MAX = 8;
export const QUESTION_MAX = 200;

/**
 * Pure: the question/answer pairs step 3 posted (its questions are editable, so they come from
 * the form). Blank pairs are dropped, a repeated question keeps the first, at most 8.
 */
export function answerPairs(
  questions: unknown[],
  answers: unknown[],
): { question: string; answer: string }[] {
  const seen = new Set<string>();
  const out: { question: string; answer: string }[] = [];
  questions.forEach((q, i) => {
    const question = String(q ?? "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, QUESTION_MAX);
    const answer = String(answers[i] ?? "").trim();
    const key = question.toLowerCase();
    if (!question || !answer || seen.has(key) || out.length >= SETUP_QUESTIONS_MAX) return;
    seen.add(key);
    out.push({ question, answer });
  });
  return out;
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
  // Nothing connected: only that (approved 17 Nov: never "connect first" and "answers on its own"
  // in one breath).
  if (!input.accounts.length) return "Waggle starts answering once you connect an account.";
  const watching = `Waggle is watching ${listWords(input.accounts)}.`;
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

type StepKey = "business" | "connect" | "answers" | "practice" | "replies";

/** The end page's main button when a step is left: the one thing to do next. */
export const NEXT_ACTION: Record<StepKey, string> = {
  business: "Tell us about your business",
  connect: "Connect an account",
  answers: "Write your top answers",
  practice: "Try 3 messages",
  replies: "Choose how replies go out",
};

/**
 * Pure: one line per step on the end page, "what Waggle knows" (approved 17 Nov): what was set
 * when done, what's missing when not.
 */
export function stepDetail(
  key: StepKey,
  done: boolean,
  facts: {
    kind: string;
    description: string;
    accounts: string[];
    answers: number;
    triesStatus: string;
    replyOnItsOwn: boolean;
  },
): string {
  switch (key) {
    case "business": {
      if (!done) return "Not yet. Two lines help Waggle tell a question from a buyer.";
      const words = facts.description.replace(/\s+/g, " ").trim();
      const quote = words.length > 60 ? `${words.slice(0, 59).replace(/\s+\S*$/, "")}…` : words;
      return [facts.kind, quote && `“${quote}”`].filter(Boolean).join(" · ");
    }
    case "connect":
      return done
        ? listWords(facts.accounts)
        : "Not yet. Waggle starts once one account is connected.";
    case "answers":
      return facts.answers === 1
        ? "1 answer"
        : facts.answers
          ? `${facts.answers} answers`
          : "Not yet";
    case "practice":
      return done
        ? "3 tried"
        : facts.triesStatus === "Not yet"
          ? "Not yet"
          : `${facts.triesStatus} tried`;
    case "replies":
      if (!done) return "Not chosen yet";
      return facts.replyOnItsOwn ? "On its own, for questions your answers cover" : "Ask me first";
  }
}
