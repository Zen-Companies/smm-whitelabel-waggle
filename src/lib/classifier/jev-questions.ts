import type { AskedCategory } from "./pick-category";

// docs/tdd.md §9.2. Bump the version on any wording change and keep the old wording here: the
// Lab (docs/tdd.md §19) runs versions side by side.
export type JevQuestions = Record<AskedCategory, string>;

const COMPLAINT =
  "Is the customer unhappy, complaining, reporting a bad experience or a problem with the business, or asking for a refund?";
const FAQ =
  "Is the customer asking a question that the business's own information could answer, such as hours, location, prices, services or policies?";
const SPAM =
  "Is this an unsolicited sales pitch, scam, promotion of another business, or something that has nothing to do with this business?";

export const JEV_QUESTION_SETS = {
  /** Starting wording. */
  "2026-10-28.1": {
    complaint: COMPLAINT,
    lead: "Does the customer want to book, buy, order, reserve or get a quote, or ask about availability or how to get started?",
    faq: FAQ,
    spam: SPAM,
  },
  // Purchase intent only: "ask about availability" sent questions like "Do you have oat milk?"
  // to lead, which outranks faq (§9.3).
  "2026-10-29.1": {
    complaint: COMPLAINT,
    lead: "Is the customer asking to make a booking or reservation, to place an order, for a price or quote for a specific order they want to make, or sharing their contact details so the business can contact them?",
    faq: FAQ,
    spam: SPAM,
  },
} as const satisfies Record<string, JevQuestions>;

export type JevQuestionsVersion = keyof typeof JEV_QUESTION_SETS;

export const JEV_QUESTIONS_VERSION: JevQuestionsVersion = "2026-10-29.1";

export const JEV_QUESTIONS: JevQuestions = JEV_QUESTION_SETS[JEV_QUESTIONS_VERSION];
