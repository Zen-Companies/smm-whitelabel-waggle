// Draft checks that cost nothing (T28, docs/tdd.md §19): run on a draft after it is written, so a
// prompt or model change can be judged on more than reading drafts by eye. An LLM judge for "uses
// only the facts given" comes later (paid or local).

export type DraftCheckName =
  "grounding" | "needs_human" | "length" | "emoji" | "language" | "no_contact_in_comment";

export interface DraftCheckResult {
  check: DraftCheckName;
  ok: boolean;
  detail: string;
}

export interface DraftToCheck {
  reply: string;
  needsHuman: boolean;
  groundingIssues: string[];
  kind: "comment" | "dm" | "review";
  customerText: string;
  /** From a sample's note: covered → should answer; not_covered → should go to the owner. */
  expect?: "covered" | "not_covered" | null;
}

/** "covered: …" / "NOT covered: …" notes in tests/fixtures/drafting/samples.json; others skip. */
export function parseExpect(note: string | undefined): DraftToCheck["expect"] {
  if (!note) return null;
  const n = note.trim().toLowerCase();
  if (n.startsWith("not covered")) return "not_covered";
  if (n.startsWith("covered")) return "covered";
  return null;
}

/** Prompt rule 3: comments at most 2 sentences, DMs at most 4. */
export const MAX_SENTENCES = { comment: 2, dm: 4, review: 3 } as const;

const EMOJI = /\p{Extended_Pictographic}/gu;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;
const PHONE = /(?:\+?63|0)\s?9\d{2}[\s-]?\d{3}[\s-]?\d{4}/;
// Common Tagalog words; one in the reply but none in the message means it switched language.
const TAGALOG =
  /\b(po|opo|kayo|namin|natin|salamat|pwede|puwede|meron|wala|kasi|yung|lang|naman|ba|mga|ninyo)\b/i;

export function countSentences(text: string): number {
  const plain = text.replace(EMOJI, "").trim();
  if (!plain) return 0;
  return plain.split(/[.!?]+(?:\s+|$)/).filter((s) => s.trim().length > 0).length;
}

export function checkDraft(d: DraftToCheck): DraftCheckResult[] {
  const results: DraftCheckResult[] = [];

  // Grounding issues are fine only when they sent the draft to the owner (rule 8).
  results.push({
    check: "grounding",
    ok: d.groundingIssues.length === 0 || d.needsHuman,
    detail: d.groundingIssues.length
      ? `${d.groundingIssues.join(", ")}${d.needsHuman ? " (sent to the owner)" : ""}`
      : "no amounts or contacts outside the facts",
  });

  if (d.expect) {
    const want = d.expect === "not_covered";
    results.push({
      check: "needs_human",
      ok: d.needsHuman === want,
      detail: want
        ? `info doesn't cover it: needsHuman should be true (is ${d.needsHuman})`
        : `info covers it: needsHuman should be false (is ${d.needsHuman})`,
    });
  }

  const sentences = countSentences(d.reply);
  results.push({
    check: "length",
    ok: sentences <= MAX_SENTENCES[d.kind],
    detail: `${sentences} sentences (at most ${MAX_SENTENCES[d.kind]} in a ${d.kind === "dm" ? "DM" : d.kind}})`,
  });

  const emojis = d.reply.match(EMOJI)?.length ?? 0;
  const customerEmojis = d.customerText.match(EMOJI)?.length ?? 0;
  results.push({
    check: "emoji",
    ok: emojis <= 1 && (customerEmojis > 0 || emojis === 0),
    detail: `${emojis} in the reply, ${customerEmojis} in the message (at most 1, and only if they used one)`,
  });

  const switched = TAGALOG.test(d.reply) && !TAGALOG.test(d.customerText);
  results.push({
    check: "language",
    ok: !switched,
    detail: switched ? "replied in Taglish to an English message" : "same language as the message",
  });

  // Comments and review replies are public: no phone numbers or emails.
  if (d.kind !== "dm") {
    const contact = EMAIL.test(d.reply) || PHONE.test(d.reply);
    results.push({
      check: "no_contact_in_comment",
      ok: !contact,
      detail: contact ? "a phone number or email in a public comment" : "no contact details",
    });
  }
  return results;
}
