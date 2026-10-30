// Example messages for the owner's practice box (T36 item 4), built from the business's own
// Business info topics, no AI call: a "Pets" topic suggests "Do you allow dogs?". Generic examples
// only when there are no topics yet.

export const GENERIC_EXAMPLES = [
  "How much is it?",
  "How do I order?",
  "Where are you located?",
  "Are you open today?",
  "Can I get a discount?",
];

const RULES: { match: RegExp; example: string }[] = [
  { match: /hour|open|schedule/i, example: "What time are you open today?" },
  { match: /price|menu|rate|fee|cost|package/i, example: "How much is it?" },
  {
    match: /location|address|direction|parking|where/i,
    example: "Where are you located? Is there parking?",
  },
  { match: /deliver|grab|foodpanda|lalamove/i, example: "Do you deliver?" },
  { match: /ship|courier/i, example: "Do you ship nationwide?" },
  { match: /book|reserv|appointment|table/i, example: "Can I book for this Saturday?" },
  { match: /pay|gcash|\bcash\b/i, example: "Do you accept GCash?" },
  { match: /\bpets?\b|\bdogs?\b|\bcats?\b/i, example: "Do you allow dogs?" },
  { match: /refund|return|exchange/i, example: "Can I get a refund?" },
  { match: /cake|custom|order/i, example: "Do you take custom orders?" },
  { match: /cater|event|function|party/i, example: "Do you cater events?" },
  { match: /wifi|internet|outlet/i, example: "Do you have wifi?" },
  { match: /download|access|link/i, example: "How do I get the download link after paying?" },
  { match: /promo|discount|sale/i, example: "Do you have any promos right now?" },
];

/** Up to `limit` examples, one per topic in the order given (most used first), no repeats. */
export function examplesFromTopics(titles: string[], limit = 5): string[] {
  const out: string[] = [];
  for (const title of titles) {
    const rule = RULES.find((r) => r.match.test(title));
    const example = rule
      ? rule.example
      : `Can you tell me about your ${title.trim().toLowerCase()}?`;
    if (!out.includes(example)) out.push(example);
    if (out.length >= limit) break;
  }
  return out.length ? out : GENERIC_EXAMPLES.slice(0, limit);
}
