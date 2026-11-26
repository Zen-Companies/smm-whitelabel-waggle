import Link from "next/link";
import type { BestPost } from "./post-metrics";

// "Best post this week" (Posts Round 4, board 3b / P5): one card above Week / Month / List, only
// when a post of this week has numbers. "See how it did" opens that post's panel.

export function BestPostCard({
  best,
  title,
  href,
}: {
  best: BestPost;
  /** The post's first line. */
  title: string;
  href: string;
}) {
  const { reached, engagement } = best.results;
  const n = (v: number) => v.toLocaleString("en-US");
  return (
    <section
      aria-label="Best post this week"
      className="border-honey-border bg-honey-tint flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[18px] border px-4 py-3"
    >
      <div className="flex min-w-[200px] flex-1 flex-col gap-0.5">
        <span className="text-honey-text text-xs font-semibold">Best post this week</span>
        <b className="text-sm font-semibold">{title}</b>
        <span className="text-ink-2 text-[13px] tabular-nums">
          {[
            reached !== null ? `${n(reached)} people reached` : null,
            engagement !== null ? `${n(engagement)} likes, comments, shares and saves` : null,
            best.comparison,
          ]
            .filter(Boolean)
            .join(" · ")}
        </span>
      </div>
      <Link
        href={href}
        scroll={false}
        className="border-line-strong bg-surface hover:bg-subtle inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-semibold"
      >
        See how it did
      </Link>
    </section>
  );
}
