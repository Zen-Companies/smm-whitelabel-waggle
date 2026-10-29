import type { AskedCategory } from "./pick-category";

// docs/tdd.md §9.2. Starting wording; T7 tunes it. Bump the version on any wording change.
export const JEV_QUESTIONS_VERSION = "2026-10-29.1";

export const JEV_QUESTIONS: Record<AskedCategory, string> = {
  complaint:
    "Is the customer unhappy, complaining, reporting a bad experience or a problem with the business, or asking for a refund?",
  // Purchase intent only (2026-10-29): "ask about availability" sent questions like "Do you have
  // oat milk?" to lead, which outranks faq (§9.3).
  lead: "Is the customer asking to make a booking or reservation, to place an order, for a price or quote for a specific order they want to make, or sharing their contact details so the business can contact them?",
  faq: "Is the customer asking a question that the business's own information could answer, such as hours, location, prices, services or policies?",
  spam: "Is this an unsolicited sales pitch, scam, promotion of another business, or something that has nothing to do with this business?",
};
