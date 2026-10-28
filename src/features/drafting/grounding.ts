// Safety net for CLAUDE.md rule 8 (drafts use only KB facts): after the model answers, any
// amount, percentage or contact detail in the reply must appear in the retrieved KB facts.
// If not, the draft goes to the owner (needsHuman) instead of out.

const AMOUNT =
  /(?:₱|php|\$|usd|p(?=\d))\s?\d[\d,]*(?:\.\d+)?|\d[\d,]*(?:\.\d+)?\s?(?:pesos?|php)\b/gi;
const PERCENT = /\d+(?:\.\d+)?\s?%/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/g;
const PHONE = /(?:\+?63|0)\s?9\d{2}[\s-]?\d{3}[\s-]?\d{4}|\(?\d{2,4}\)?[\s-]\d{3,4}[\s-]\d{4}/g;

const digits = (s: string) => s.replace(/[^\d.]/g, "").replace(/\.0+$/, "");

export type GroundingIssue =
  "ungrounded_amount" | "ungrounded_percentage" | "contact_details_not_in_kb";

export function groundingIssues(
  reply: string,
  facts: { content: string; title: string }[],
): GroundingIssue[] {
  const kb = facts.map((f) => `${f.title} ${f.content}`).join(" ");
  const kbDigits = new Set((kb.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map(digits));
  const kbLower = kb.toLowerCase();
  const kbPhoneDigits = kb.replace(/[^\d]/g, "");
  const issues = new Set<GroundingIssue>();

  for (const m of reply.match(AMOUNT) ?? []) {
    if (!kbDigits.has(digits(m))) issues.add("ungrounded_amount");
  }
  for (const m of reply.match(PERCENT) ?? []) {
    if (!kbDigits.has(digits(m))) issues.add("ungrounded_percentage");
  }
  for (const m of reply.match(EMAIL) ?? []) {
    if (!kbLower.includes(m.toLowerCase())) issues.add("contact_details_not_in_kb");
  }
  for (const m of reply.match(PHONE) ?? []) {
    const d = m.replace(/[^\d]/g, "");
    if (!kbPhoneDigits.includes(d.slice(-10))) issues.add("contact_details_not_in_kb");
  }
  return [...issues];
}
