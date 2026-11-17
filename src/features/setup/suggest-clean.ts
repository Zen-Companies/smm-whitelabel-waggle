import { QUESTION_MAX } from "./starter";

/** Pure: the model's questions, trimmed, ending in "?", no numbering, no repeats, at most 6. */
export function cleanQuestions(raw: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of raw) {
    let q = r
      .replace(/^\s*(?:\d+[.)]|[-*•])\s*/, "")
      .replace(/^["“]|["”]$/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!q || q.length > QUESTION_MAX) continue;
    if (!q.endsWith("?")) q = `${q.replace(/[.!]+$/, "")}?`;
    const key = q.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
    if (out.length === 6) break;
  }
  return out;
}
