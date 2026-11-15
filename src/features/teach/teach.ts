// Teach Waggle (T73): pure helpers, tested next to them.

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

/**
 * Questions still to answer: the grouped gaps minus any the owner already answered here (an
 * answer saved from a question is titled with it, while the message itself may still wait in
 * the Inbox).
 */
export function unansweredQuestions<T extends { text: string }>(
  questions: T[],
  answers: { title: string }[],
): T[] {
  const titles = new Set(answers.map((a) => norm(a.title.replace(/…$/, ""))));
  return questions.filter((q) => {
    const n = norm(q.text);
    return ![...titles].some((t) => t && (n === t || (t.length >= 20 && n.startsWith(t))));
  });
}
