// A list shown a page at a time inside a setup screen (Walter, 20 Nov): the screen never grows,
// however many there are, and "1–4 of 37 · ‹ Page 1 of 10 ›" says there's more. Pure, tested.

export interface Page<T> {
  items: T[];
  /** 0-based, clamped to the pages there are. */
  page: number;
  pages: number;
  /** 1-based positions of the first and last item shown (0 and 0 when empty). */
  from: number;
  to: number;
  total: number;
}

export function pageOf<T>(all: readonly T[], page: number, size: number): Page<T> {
  const per = Math.max(1, Math.floor(size));
  const pages = Math.max(1, Math.ceil(all.length / per));
  const at = Math.min(Math.max(0, Math.floor(Number.isFinite(page) ? page : 0)), pages - 1);
  const items = all.slice(at * per, at * per + per);
  return {
    items,
    page: at,
    pages,
    from: items.length ? at * per + 1 : 0,
    to: at * per + items.length,
    total: all.length,
  };
}
