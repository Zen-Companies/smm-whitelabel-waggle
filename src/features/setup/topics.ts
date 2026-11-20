// What customers wanted, and Waggle's replies in batches (setup steps 2 and 3, Walter's flow
// approved 20 Nov). Money first: people who want to buy or order, and price questions; then the
// quick ones (hours, where you are, delivery) and the rest. Pure, tested.

export const SETUP_TOPICS = ["order", "price", "delivery", "hours", "location", "other"] as const;
export type SetupTopic = (typeof SETUP_TOPICS)[number];

export const TOPIC_LABEL: Record<SetupTopic, string> = {
  order: "Orders",
  price: "Prices",
  delivery: "Delivery",
  hours: "Opening hours",
  location: "Where you are",
  other: "Other",
};

const ORDER =
  /\b(order|orders|ordering|pre-?order\w*|reserve|reservation|book|booking|buy|purchase|pa-?order|pabili|avail|available|in stock|stocks?|sold out|pick ?up|cake for|for (?:tomorrow|today|saturday|sunday|my|our|a party|an event))\b/i;
const PRICE =
  /(\bhow much\b|\bprices?\b|\bpricing\b|\bcosts?\b|\brates?\b|\bfees?\b|\bmagkano\b|\bhm po\b|\bcu[aá]nto\b|\bprecios?\b|\bcombien\b|\bprix\b|[$€£₱])/i;
const DELIVERY =
  /\b(deliver|delivers|delivery|deliveries|ship|shipping|courier|grab|foodpanda|lalamove|lbc|cod)\b/i;
const HOURS =
  /\b(open|opening|opens|hours|close|closing|closes|what time|anong oras|bukas|horario|today\?)\b/i;
const LOCATION =
  /\b(where|located|location|address|branch|branches|directions|map|near|parking|saan|asa)\b/i;

/**
 * A message's topic from its words; a lead (Jev: wants to buy or book) with no clearer topic is
 * an order. Price beats order when both are there ("how much for 50?" is a price question).
 */
export function setupTopic(text: string, category?: string | null): SetupTopic {
  if (PRICE.test(text)) return "price";
  if (ORDER.test(text)) return "order";
  if (DELIVERY.test(text)) return "delivery";
  if (HOURS.test(text)) return "hours";
  if (LOCATION.test(text)) return "location";
  return category === "lead" ? "order" : "other";
}

/** Wanting to buy or order: setup's "N wanted to buy or order" and the first batch. */
export const isMoneyTopic = (t: SetupTopic): boolean => t === "order" || t === "price";

/** How many asked about each topic, most first, Other last; topics no one asked are left out. */
export function topicCounts(
  messages: readonly { text: string; category?: string | null }[],
): { topic: SetupTopic; label: string; count: number }[] {
  const counts = new Map<SetupTopic, number>();
  for (const m of messages) {
    const t = setupTopic(m.text, m.category);
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([topic, count]) => ({ topic, label: TOPIC_LABEL[topic], count }))
    .sort((a, b) =>
      a.topic === "other"
        ? 1
        : b.topic === "other"
          ? -1
          : b.count - a.count || SETUP_TOPICS.indexOf(a.topic) - SETUP_TOPICS.indexOf(b.topic),
    );
}

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReplyRow {
  itemId: string;
  draftId: string;
  kind: string;
  author: string | null;
  /** The customer's message, in full. */
  text: string;
  /** Waggle's reply. */
  reply: string;
  category: string | null;
  receivedAt: string;
  /** The item's status: awaiting_approval, or sending / sent once approved. */
  status: string;
}

export interface BatchReply extends ReplyRow {
  topic: SetupTopic;
  /** DMs: whole hours left in the 24-hour window (at least 1); null for comments. */
  hoursLeft: number | null;
  /** Approved: on its way or sent. */
  approved: boolean;
}

export function hoursLeft(kind: string, receivedAt: string, now: Date): number | null {
  if (kind !== "dm") return null;
  const left = Date.parse(receivedAt) + DAY_MS - now.getTime();
  return left > 0 ? Math.max(1, Math.floor(left / 3_600_000)) : null;
}

const APPROVED = new Set(["sending", "sent"]);

/**
 * The replies in two batches: money (orders and prices) and the rest. In each, DMs with the least
 * time left come first (their window is running), then comments, newest first. A DM whose window
 * has closed can't be sent from Waggle and isn't listed.
 */
export function batchReplies(
  rows: readonly ReplyRow[],
  now: Date,
): { money: BatchReply[]; rest: BatchReply[] } {
  const money: BatchReply[] = [];
  const rest: BatchReply[] = [];
  for (const r of rows) {
    const left = hoursLeft(r.kind, r.receivedAt, now);
    const approved = APPROVED.has(r.status);
    if (r.kind === "dm" && left === null && !approved) continue;
    const topic = setupTopic(r.text, r.category);
    const reply: BatchReply = { ...r, topic, hoursLeft: left, approved };
    (isMoneyTopic(topic) ? money : rest).push(reply);
  }
  const order = (a: BatchReply, b: BatchReply) =>
    (a.hoursLeft ?? 1000) - (b.hoursLeft ?? 1000) ||
    Date.parse(b.receivedAt) - Date.parse(a.receivedAt);
  return { money: money.sort(order), rest: rest.sort(order) };
}

/** The rest batch's title: "6 quick questions" when all are quick, else "6 more questions". */
export function restTitle(rest: readonly { topic: SetupTopic }[]): string {
  const n = rest.length;
  const quick = rest.every((r) => r.topic === "delivery" || r.topic === "hours" || r.topic === "location");
  return `${n} ${quick ? "quick" : "more"} ${n === 1 ? "question" : "questions"}`;
}

/** "Hours, where you are and delivery": the topics in a batch, in plain words. */
export function topicsLine(rest: readonly { topic: SetupTopic }[]): string {
  const words: Record<SetupTopic, string> = {
    order: "orders",
    price: "prices",
    delivery: "delivery",
    hours: "hours",
    location: "where you are",
    other: "other questions",
  };
  const seen = SETUP_TOPICS.filter((t) => rest.some((r) => r.topic === t)).map((t) => words[t]);
  if (seen.length === 0) return "";
  const line =
    seen.length === 1 ? seen[0] : `${seen.slice(0, -1).join(", ")} and ${seen[seen.length - 1]}`;
  return `${line.charAt(0).toUpperCase()}${line.slice(1)}.`;
}
