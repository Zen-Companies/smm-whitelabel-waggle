/** `BizBell` wordmark (Bricolage 24/800) with the violet-dot logo placeholder (design.md §8). */
export function Brand() {
  return (
    <span className="flex items-center gap-2">
      <span aria-hidden className="bg-violet inline-block size-3 rounded-full" />
      <span className="font-display text-2xl font-extrabold tracking-tight">BizBell</span>
    </span>
  );
}
