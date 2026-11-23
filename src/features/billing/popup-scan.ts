// The upgrade pop-up's own numbers from the brand's latest catch-up (the 30-day read), for the
// honey box (pop-ups plan, approved 23 Nov). "Wanted to buy" (decided 23 Nov) is a Jev lead, or a
// question about a price or an order, that nobody answered: the same rule as setup's "N wanted to
// buy or order" (setup/topics.ts isMoneyTopic). Pure.

const ORDER =
  /\b(order|orders|ordering|pre-?order\w*|reserve|reservation|book|booking|buy|purchase|pa-?order|pabili|avail|available|in stock|stocks?|sold out|pick ?up|cake for|for (?:tomorrow|today|saturday|sunday|my|our|a party|an event))\b/i;
const PRICE =
  /(\bhow much\b|\bprices?\b|\bpricing\b|\bcosts?\b|\brates?\b|\bfees?\b|\bmagkano\b|\bhm po\b|\bcu[aá]nto\b|\bprecios?\b|\bcombien\b|\bprix\b|[$€£₱])/i;
/** Jev's categories that are questions, refined by their words (an order word alone isn't one). */
const QUESTION = new Set(["faq", "unclear"]);

/** Pure: whether a message wanted to buy: a Jev lead, or about a price or an order. */
export function wantsToBuy(text: string, category: string | null): boolean {
  if (category === "spam" || category === "complaint") return false;
  if (category === "lead") return true;
  if (PRICE.test(text)) return true;
  return !QUESTION.has(category ?? "") && ORDER.test(text);
}

export interface ScanItem {
  kind: string;
  category: string | null;
  status: string;
  text: string;
}

export interface LockedMessage {
  conversation: string;
  category: string | null;
  text: string;
}

export interface ScanNumbers {
  buyers: number;
  lockedDms: number;
  answeredDms: number;
  answeredComments: number;
}

/**
 * Pure: the catch-up's numbers. Buyers: open pulled messages that wanted to buy, plus locked DM
 * conversations where any message did. Locked DMs: one per conversation, spam left out. Answered:
 * pulled messages already sent, by kind.
 */
export function scanNumbers(
  items: readonly ScanItem[],
  locked: readonly LockedMessage[],
  closed: readonly string[],
): ScanNumbers {
  const isOpen = (s: string) => !closed.includes(s);
  let buyers = 0;
  let answeredDms = 0;
  let answeredComments = 0;
  for (const i of items) {
    if (i.status === "sent") {
      if (i.kind === "dm") answeredDms += 1;
      else if (i.kind === "comment") answeredComments += 1;
    }
    if (isOpen(i.status) && wantsToBuy(i.text, i.category)) buyers += 1;
  }
  const conversations = new Map<string, { category: string | null; texts: string[] }>();
  for (const m of locked) {
    const c = conversations.get(m.conversation);
    if (c) {
      c.texts.push(m.text);
      c.category ??= m.category;
    } else {
      conversations.set(m.conversation, { category: m.category, texts: [m.text] });
    }
  }
  let lockedDms = 0;
  for (const c of conversations.values()) {
    if (c.category === "spam") continue;
    lockedDms += 1;
    if (c.texts.some((t) => wantsToBuy(t, c.category))) buyers += 1;
  }
  return { buyers, lockedDms, answeredDms, answeredComments };
}
