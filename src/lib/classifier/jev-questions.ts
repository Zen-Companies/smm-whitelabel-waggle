import type { AskedCategory } from "./pick-category";

// docs/tdd.md §9.2. Starting wording; T7 tunes it. Bump the version on any wording change.
export const JEV_QUESTIONS_VERSION = "2026-10-28.1";

export const JEV_QUESTIONS: Record<AskedCategory, string> = {
  complaint:
    "Is the customer unhappy, complaining, reporting a bad experience or a problem with the business, or asking for a refund?",
  lead: "Does the customer want to book, buy, order, reserve or get a quote, or ask about availability or how to get started?",
  faq: "Is the customer asking a question that the business's own information could answer, such as hours, location, prices, services or policies?",
  spam: "Is this an unsolicited sales pitch, scam, promotion of another business, or something that has nothing to do with this business?",
};
