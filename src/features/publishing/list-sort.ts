// The List view's sort (Posts Round 5, a Round 4 leftover): Newest (the usual order: what needs
// you, then planned, then posted), Most reached or Most engagement (posts with numbers first,
// highest first; the rest after them in the usual order). Numbers come from Waggle's hourly
// copy (post_metrics). Pure.

export const LIST_SORTS = [
  { key: "newest", label: "Newest" },
  { key: "reached", label: "Most reached" },
  { key: "engagement", label: "Most engagement" },
] as const;
export type ListSort = (typeof LIST_SORTS)[number]["key"];

export function parseListSort(raw: string | undefined): ListSort {
  return raw === "reached" || raw === "engagement" ? raw : "newest";
}

/** `rows` (already in the usual order) by `sort`; ties keep the usual order. */
export function sortListRows<T>(
  rows: readonly T[],
  sort: ListSort,
  numbers: (row: T) => { reached: number | null; engagement: number | null } | null,
): T[] {
  if (sort === "newest") return [...rows];
  const key = (row: T) => numbers(row)?.[sort] ?? null;
  return rows
    .map((row, i) => ({ row, i, n: key(row) }))
    .sort((a, b) => {
      if (a.n === null && b.n === null) return a.i - b.i;
      if (a.n === null) return 1;
      if (b.n === null) return -1;
      return b.n - a.n || a.i - b.i;
    })
    .map((x) => x.row);
}
