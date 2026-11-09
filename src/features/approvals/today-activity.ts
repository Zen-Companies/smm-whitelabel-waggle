// "What Waggle did today" on the empty inbox (design v3 "Inbox empty · B"). Pure; tested.

export interface ActivityEntry {
  itemId: string;
  what: "answered" | "ignored";
  kind: "comment" | "dm" | "review";
  authorName: string | null;
  text: string;
  at: string;
}

/** Newest first, at most `limit`. */
export function mergeActivity(
  answered: readonly ActivityEntry[],
  ignored: readonly ActivityEntry[],
  limit = 5,
): ActivityEntry[] {
  return [...answered, ...ignored].sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
}

const KIND: Record<ActivityEntry["kind"], string> = {
  comment: "a comment",
  dm: "a DM",
  review: "a review",
};

/** "a DM from Jun R." / "a comment" (spam keeps no name). */
export function activitySubject(e: Pick<ActivityEntry, "kind" | "authorName" | "what">): string {
  const name = e.what === "answered" ? e.authorName?.trim() : null;
  return name ? `${KIND[e.kind]} from ${name}` : KIND[e.kind];
}

/** The start of the customer's message, on one line. */
export function snippet(text: string, max = 60): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1).trimEnd()}…` : one;
}
