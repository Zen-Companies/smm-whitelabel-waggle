import Link from "next/link";
import { BarList } from "./charts/bar-list";
import { ChartTable } from "./charts/chart-table";
import { SERIES_1, SERIES_2 } from "./charts/colors";
import { StackedBars } from "./charts/stacked-bars";
import { duration, full, longDate, shortDate, timeSaved } from "./format";
import { Card, NoData, Tile } from "./parts";
import { MINUTES_PER_REPLY, type WorkSummary } from "./work";

// Waggle's work (T52, design: Analytics · Waggle's work). From Waggle's own tables, live.

function Rows({ rows }: { rows: { label: string; count: number }[] }) {
  return (
    <ul className="flex flex-col">
      {rows.map((r) => (
        <li
          key={r.label}
          className="border-subtle flex items-center justify-between gap-3 border-t py-2.5 first:border-t-0"
        >
          <span className="text-ink-2 min-w-0 truncate">{r.label}</span>
          <b className="font-semibold tabular-nums">{full(r.count)}</b>
        </li>
      ))}
    </ul>
  );
}

export function WorkSection({ work, period }: { work: WorkSummary; period: number }) {
  const replies = work.byWaggle + work.byYou;
  const notCovered = work.neededYou.find((r) => r.reason === "needs_human")?.count ?? 0;
  const days = work.perDay.map((d) => d.date);

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Totals" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <Tile
          label="Messages and comments in"
          value={full(work.messagesIn)}
          delta={work.messagesInDelta}
          compare={` vs the ${period} days before`}
          note="Nothing earlier to compare with"
        />
        <Tile
          label="Answered by Waggle"
          value={full(work.byWaggle)}
          note={
            work.waggleShare === null
              ? "No replies sent yet"
              : `${work.waggleShare}% of all replies`
          }
        />
        <Tile
          label="Time to first reply"
          value={
            work.firstReplyWaggle !== null
              ? duration(work.firstReplyWaggle)
              : work.firstReplyYou !== null
                ? duration(work.firstReplyYou)
                : "–"
          }
          note={
            work.firstReplyWaggle === null
              ? work.firstReplyYou !== null
                ? "Your replies; Waggle sent none on its own"
                : "No replies sent yet"
              : work.firstReplyYou !== null
                ? `When you answer: ${duration(work.firstReplyYou)}`
                : "Waggle's replies on its own"
          }
        />
        <Tile label="Leads found" value={full(work.leads)} note="From comments and DMs" />
        <Tile
          label="Time saved, about"
          value={timeSaved(work.byWaggle, MINUTES_PER_REPLY)}
          note={`An estimate at ${MINUTES_PER_REPLY} minutes a reply`}
        />
      </section>

      <Card title="Replies per day" label="Replies per day">
        {replies === 0 ? (
          <NoData>No replies went out in these {period} days.</NoData>
        ) : (
          <>
            <StackedBars
              ariaLabel={`Replies per day, ${shortDate(days[0])} to ${shortDate(days[days.length - 1])}: ${full(work.byWaggle)} sent by Waggle on its own, ${full(work.byYou)} sent by you.`}
              xLabels={days.map(shortDate)}
              xTitles={days.map(longDate)}
              segments={[
                {
                  name: "Sent by Waggle on its own",
                  color: SERIES_1,
                  values: work.perDay.map((d) => d.waggle),
                },
                { name: "Sent by you", color: SERIES_2, values: work.perDay.map((d) => d.you) },
              ]}
            />
            <p className="meta">
              &quot;Sent by you&quot; counts replies you approved, edited or wrote.
            </p>
            <ChartTable
              caption="Replies per day"
              columns={["Day", "Sent by Waggle on its own", "Sent by you"]}
              rows={work.perDay.map((d) => [longDate(d.date), d.waggle, d.you])}
            />
          </>
        )}
      </Card>

      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="What came in">
          {work.cameIn.length === 0 ? (
            <NoData>Nothing came in during these {period} days.</NoData>
          ) : (
            <BarList
              ariaLabel={`What came in: ${work.cameIn.map((c) => `${c.label} ${c.count}`).join(", ")}.`}
              columns={["Kind", "Messages and comments"]}
              rows={work.cameIn.map((c) => ({
                label: c.label,
                value: c.count,
                display: full(c.count),
              }))}
            />
          )}
        </Card>
        <Card title="Most asked">
          <span className="meta">The Business info topics Waggle answered from</span>
          {work.mostAsked.length === 0 ? (
            <NoData>No replies from your Business info yet.</NoData>
          ) : (
            <Rows rows={work.mostAsked.map((t) => ({ label: t.title, count: t.count }))} />
          )}
        </Card>
        <Card title="Where Waggle needed you">
          {work.neededYou.length === 0 ? (
            <NoData>Waggle didn&apos;t need you in these {period} days.</NoData>
          ) : (
            <Rows rows={work.neededYou} />
          )}
          {notCovered > 0 && (
            <Link href="/knowledge-base" className="text-sm font-medium">
              Add the missing answers to Business info
            </Link>
          )}
        </Card>
      </div>
    </div>
  );
}
