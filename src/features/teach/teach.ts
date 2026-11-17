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

const MODE_WORDS: Record<string, string> = {
  off: "Off",
  approve: "Ask me first",
  auto: "Reply on its own",
};

/**
 * Pure: the "How Waggle replies" card in three lines (Overview, approved 16 Nov). Questions and
 * Leads follow the owner's setting (Off when none is saved); complaints always come to them.
 */
export function repliesSummary(
  modes: { category: string; mode: string }[],
): { label: string; mode: string; state: "working" | "waiting" | "off" }[] {
  const of = (category: string) => modes.find((m) => m.category === category)?.mode ?? "off";
  const line = (label: string, mode: string) => ({
    label,
    mode: MODE_WORDS[mode] ?? MODE_WORDS.off,
    state:
      mode === "auto"
        ? ("working" as const)
        : mode === "approve"
          ? ("waiting" as const)
          : ("off" as const),
  });
  return [
    line("Questions", of("faq")),
    line("Leads", of("lead")),
    { label: "Complaints", mode: "Always to you", state: "waiting" },
  ];
}
