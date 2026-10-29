/** Pure: how many replies used each topic ("Used in 12 replies this week", design v2). */
export function usageByEntry(drafts: { kb_entry_ids: string[] | null }[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const d of drafts) {
    for (const id of new Set(d.kb_entry_ids ?? [])) counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export function usageText(count: number): string {
  if (count === 0) return "Not used this week";
  return count === 1 ? "Used in 1 reply this week" : `Used in ${count} replies this week`;
}

/** Pure: topics whose title or details contain the search, case-insensitive. */
export function matchTopics<T extends { title: string; content: string }>(
  entries: T[],
  q: string,
): T[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return entries;
  return entries.filter(
    (e) => e.title.toLowerCase().includes(needle) || e.content.toLowerCase().includes(needle),
  );
}
