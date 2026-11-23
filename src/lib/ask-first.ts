// "Always ask me" topics (setup's last screen, Walter's flow approved 20 Nov). Shared by setup (the
// toggles) and approvals (the policy step): when Waggle replies on its own, a message about one of
// these topics waits for the owner instead (policy reason ask_first_topic). Complaints always
// come to the owner whatever is chosen here. Pure.

export const ASK_FIRST_IDS = ["refunds", "allergies", "health", "discounts", "big_orders"] as const;
export type AskFirstId = (typeof ASK_FIRST_IDS)[number];

export const ASK_FIRST_LABELS: Record<AskFirstId, string> = {
  refunds: "Refunds and complaints",
  allergies: "Allergies and ingredients",
  health: "Health and medical questions",
  discounts: "Discounts and deals",
  big_orders: "Big or custom orders",
};

const WORDS: Record<AskFirstId, RegExp> = {
  refunds:
    /\b(refunds?|refunded|money back|reembolso|cancel(?:led|ed|lation)?|complain\w*|broken|damaged|wrong order|never (?:arrived|came)|scam)\b/i,
  allergies:
    /\b(allerg\w*|gluten|celiac|coeliac|nuts?|peanuts?|dairy|lactose|vegan|halal|kosher|ingredients?|shellfish|eggs?)\b/i,
  health:
    /\b(pregnan\w*|medical|medication|diabet\w*|skin condition|eczema|injur\w*|doctor|rash|infection|blood pressure|heart condition)\b/i,
  discounts:
    /\b(discounts?|promos?|promo code|coupons?|vouchers?|deals?|sale|cheaper|best price|tawad|less po)\b|\d+\s?% off/i,
  big_orders:
    /\b(bulk|wholesale|custom|catering|event|wedding|party|corporate|\d{2,}\s?(?:pcs|pieces|boxes|orders|people|pax))\b/i,
};

export const isAskFirstId = (v: unknown): v is AskFirstId =>
  typeof v === "string" && (ASK_FIRST_IDS as readonly string[]).includes(v);

/**
 * The topics setup offers for a kind of business (the business profile's first line, e.g. "food"),
 * with which start switched on. Refunds and complaints is always first and on.
 */
export function askFirstTopicsFor(
  kind: string | null,
): { id: AskFirstId; label: string; on: boolean }[] {
  const ids: { id: AskFirstId; on: boolean }[] = [{ id: "refunds", on: true }];
  if (kind === "food") ids.push({ id: "allergies", on: true });
  else if (kind === "beauty" || kind === "fitness") ids.push({ id: "health", on: true });
  else if (kind === "shop") ids.push({ id: "allergies", on: false });
  ids.push({ id: "discounts", on: false }, { id: "big_orders", on: false });
  return ids.map((t) => ({ ...t, label: ASK_FIRST_LABELS[t.id] }));
}

// The owner's own topics (approved 21 Nov, "Add your own"): stored beside the built-in ids as
// "custom:<words>". Matched on the words typed (each may take an s/es), as a phrase, not on meaning.
export const CUSTOM_PREFIX = "custom:";
export const CUSTOM_MAX = 10;
export const CUSTOM_LENGTH_MAX = 40;

/** Pure: the stored form of a topic the owner typed, or null when there's nothing usable. */
export function customTopic(words: string): string | null {
  const clean = words
    .toLowerCase()
    .replace(/[^\p{L}\p{N}'\- ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (clean.length < 2 || clean.length > CUSTOM_LENGTH_MAX) return null;
  return CUSTOM_PREFIX + clean;
}

export const isCustomTopic = (v: unknown): v is string =>
  typeof v === "string" &&
  v.startsWith(CUSTOM_PREFIX) &&
  customTopic(v.slice(CUSTOM_PREFIX.length)) === v;

/** "wedding cakes" from "custom:wedding cakes". */
export const customLabel = (topic: string): string => topic.slice(CUSTOM_PREFIX.length);

function customPattern(topic: string): RegExp {
  const words = customLabel(topic)
    .split(" ")
    .map((w) => escapeRegExp(w.replace(/(?:es|s)$/, "")) + "(?:s|es)?");
  return new RegExp(`(?<![\\p{L}\\p{N}])${words.join("\\s+")}(?![\\p{L}\\p{N}])`, "iu");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The first chosen topic the message is about (a built-in id, or the owner's own "custom:…"), or
 * null. Unknown ids are ignored.
 */
export function askFirstMatch(text: string, topics: readonly string[]): string | null {
  for (const id of ASK_FIRST_IDS) {
    if (topics.includes(id) && WORDS[id].test(text)) return id;
  }
  for (const t of topics) {
    if (isCustomTopic(t) && customPattern(t).test(text)) return t;
  }
  return null;
}
