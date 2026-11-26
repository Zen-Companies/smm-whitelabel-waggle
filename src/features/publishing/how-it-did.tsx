import Link from "next/link";
import { PlatformMark } from "@/components/app/platform-mark";
import { platformLabel } from "@/lib/social/platforms";
import {
  noNumbersLine,
  platformSummary,
  showNum,
  updatedLine,
  type PostResults,
} from "./post-metrics";

// "How it did" (Posts Round 4, board 3a / P4): a published post's numbers in its panel, read from
// Waggle's hourly copy. Four totals, one line per app, when they were last copied, and the way to
// its comments.

export function HowItDid({ results, now }: { results: PostResults; now: Date }) {
  const updated = updatedLine(results.updatedAt, now);
  const totals: [string, string][] = [
    ["People reached", showNum(results.reached)],
    ["Likes", showNum(results.likes)],
    ["Comments", showNum(results.comments)],
    ["Shares", showNum(results.shares)],
  ];
  const commentCount = results.comments ?? 0;
  return (
    <section
      aria-label="How it did"
      className="border-line flex w-full flex-col gap-3 border-t pt-4"
    >
      <div className="flex flex-wrap items-baseline gap-x-3">
        <h3 className="section-title">How it did</h3>
        {updated && <span className="meta">{updated}</span>}
      </div>
      {results.hasNumbers ? (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {totals.map(([label, value]) => (
            <div
              key={label}
              className="bg-surface border-line flex flex-col-reverse rounded-xl border px-3 py-2.5"
            >
              <dt className="text-ink-3 text-xs">{label}</dt>
              <dd className="font-heading text-xl font-semibold tabular-nums">{value}</dd>
            </div>
          ))}
        </dl>
      ) : results.noneShare ? null : (
        <p className="text-ink-2 text-sm">The numbers come in within the hour after it goes out.</p>
      )}
      <ul className="divide-line flex flex-col divide-y text-sm" aria-label="By app">
        {results.platforms.map((l) => (
          <li key={l.platform} className="flex items-start gap-2.5 py-2.5">
            <PlatformMark platform={l.platform} size={22} />
            <span className="flex min-w-0 flex-1 flex-col">
              <b className="font-semibold">{platformLabel(l.platform)}</b>
              <span className={l.noNumbers || l.waiting ? "text-ink-3" : "text-ink-2 tabular-nums"}>
                {l.noNumbers
                  ? noNumbersLine(l.platform)
                  : l.waiting
                    ? "Numbers not in yet."
                    : platformSummary(l)}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {results.platforms.some((l) => l.platform === "facebook" && !l.waiting) && (
        <p className="meta">
          Facebook counts reactions as likes, and reports how many times it was seen; Waggle shows
          that as reached.
        </p>
      )}
      {!results.noneShare && (
        <div className="flex flex-wrap gap-2">
          <Link
            href="/inbox"
            className="border-line-strong bg-surface hover:bg-subtle inline-flex min-h-11 w-full items-center justify-center rounded-xl border px-4 text-sm font-semibold sm:w-auto"
          >
            {commentCount > 0
              ? `See ${commentCount === 1 ? "the comment" : `the ${commentCount.toLocaleString("en-US")} comments`} in Inbox`
              : "See comments in Inbox"}
          </Link>
          <Link
            href="/insights"
            className="text-ink-2 hover:text-ink inline-flex min-h-11 items-center px-2 text-sm font-medium"
          >
            Open in Insights
          </Link>
        </div>
      )}
    </section>
  );
}
