import Link from "next/link";
import { platformName } from "@/components/app/time";
import type { DashboardSummary } from "@/lib/social/analytics-types";
import { BarList } from "./charts/bar-list";
import { ChartTable } from "./charts/chart-table";
import { PREVIOUS, SERIES_1, platformColor } from "./charts/colors";
import { LineChart } from "./charts/line-chart";
import type { OverviewData } from "./data";
import {
  compact,
  full,
  gainedDelta,
  longDate,
  percent,
  percentDelta,
  pointsDelta,
  shortDate,
} from "./format";
import { LocalSlotText } from "./local-time";
import { Card, NoData, Thumb, Tile } from "./parts";
import { bestPosts, isPending, postMeta, postTitle } from "./posts";
import { insightText, standOut } from "./stood-out";

// Overview (T49, design: Analytics · Overview).

export const MEASURES = [
  { key: "reach", label: "Reached", title: "People reached per day", unit: "reached" },
  { key: "seen", label: "Seen", title: "Times seen per day", unit: "times seen" },
  {
    key: "engagement",
    label: "Likes, comments, shares, saves",
    title: "Likes, comments, shares and saves per day",
    unit: "likes, comments, shares and saves",
  },
  { key: "followers", label: "New followers", title: "New followers per day", unit: "new" },
] as const;
export type Measure = (typeof MEASURES)[number]["key"];
export const parseMeasure = (v: string | undefined): Measure =>
  MEASURES.find((m) => m.key === v)?.key ?? "reach";

const pick = (d: DashboardSummary["daily"][number], m: Measure) =>
  m === "reach"
    ? d.reach
    : m === "seen"
      ? d.impressions
      : m === "engagement"
        ? d.engagement
        : d.followersGained;

export function OverviewSection({
  data,
  period,
  measure,
  hrefFor,
}: {
  data: OverviewData;
  period: number;
  measure: Measure;
  /** Links within the page, keeping the period and platform. */
  hrefFor: (change: Record<string, string | undefined>) => string;
}) {
  const { summary, posts } = data;
  if (!summary) {
    return (
      <NoData>
        The numbers for these {period} days aren&apos;t in yet. They usually show within the hour.
      </NoData>
    );
  }
  const t = summary.totals;
  const prev = summary.previousTotals;
  const quiet = posts.length === 0 && t.impressions === 0;
  const m = MEASURES.find((x) => x.key === measure)!;
  const days = summary.daily.map((d) => d.date);
  const values = summary.daily.map((d) => pick(d, measure));
  const prevValues = data.previousDaily?.map((d) => pick(d, measure)) ?? null;
  const postedDays = new Set(posts.flatMap((p) => p.publishedAt?.slice(0, 10) ?? []));
  const marks = days.flatMap((d, i) => (postedDays.has(d) ? [i] : []));
  const peak = values.length ? Math.max(...values) : 0;
  const peakDay = days[values.indexOf(peak)];
  const best = bestPosts(posts, 5);
  const insights = standOut({
    posts,
    bestTimes: data.bestTimes,
    waggleComments: data.waggleComments,
  });

  return (
    <div className="flex flex-col gap-5">
      <section aria-label="Totals" className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <Tile
          label="People reached"
          value={compact(t.reach)}
          delta={percentDelta(t.reach, prev?.reach)}
          compare={` vs the ${period} days before`}
          note="Nothing earlier to compare with"
        />
        <Tile
          label="Times seen"
          value={compact(t.impressions)}
          delta={percentDelta(t.impressions, prev?.impressions)}
          note="Nothing earlier to compare with"
        />
        <Tile
          label="Engagement rate"
          value={quiet ? "–" : percent(t.engagementRate)}
          delta={quiet ? null : pointsDelta(t.engagementRate, prev?.engagementRate)}
          note={quiet ? `No posts in these ${period} days` : "Nothing earlier to compare with"}
        />
        <Tile
          label="Followers"
          value={full(summary.followers.current)}
          delta={gainedDelta(summary.followers.gained)}
        />
        <Tile
          label="Link and profile clicks"
          value={compact(t.clicks)}
          delta={percentDelta(t.clicks, prev?.clicks)}
          note="Nothing earlier to compare with"
        />
      </section>

      <Card
        title={m.title}
        aside={
          <nav aria-label="Measure" className="segmented flex-wrap">
            {MEASURES.map((x) => (
              <Link
                key={x.key}
                href={hrefFor({ measure: x.key })}
                scroll={false}
                data-active={x.key === measure || undefined}
                aria-current={x.key === measure ? "true" : undefined}
              >
                {x.label}
              </Link>
            ))}
          </nav>
        }
      >
        <LineChart
          ariaLabel={`${m.title}, ${shortDate(summary.fromDate)} to ${shortDate(summary.toDate)}.${
            peakDay ? ` Peak ${full(peak)} on ${shortDate(peakDay)}.` : ""
          }`}
          xLabels={days.map(shortDate)}
          xTitles={days.map(longDate)}
          unit={m.unit}
          marks={marks}
          markNote="You posted this day"
          series={[
            { name: `Last ${period} days`, color: SERIES_1, values },
            ...(prevValues
              ? [
                  {
                    name: `The ${period} days before`,
                    color: PREVIOUS,
                    values: prevValues,
                    dashed: true,
                  },
                ]
              : []),
          ]}
        />
        <p className="meta">
          Counts what arrived each day, on any post. A dot marks a day you posted.
          {!prevValues &&
            period === 90 &&
            " The 90 days before aren't kept, so there's no dashed line."}
        </p>
        <ChartTable
          caption={m.title}
          columns={[
            "Day",
            `Last ${period} days`,
            ...(prevValues ? [`The ${period} days before`] : []),
          ]}
          rows={days.map((d, i) => [
            longDate(d),
            full(values[i]),
            ...(prevValues ? [full(prevValues[i])] : []),
          ])}
        />
      </Card>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card
          title="Best posts this period"
          aside={
            <span className="flex items-center gap-3">
              <span className="meta hidden sm:inline">by likes, comments, shares and saves</span>
              <Link href={hrefFor({ section: "posts" })} className="text-sm font-medium">
                All posts
              </Link>
            </span>
          }
        >
          {best.length === 0 ? (
            <NoData>No posts in these {period} days.</NoData>
          ) : (
            <ul className="flex flex-col">
              {best.map((p) => (
                <li key={p.id} className="border-subtle border-t first:border-t-0">
                  <Link
                    href={hrefFor({ section: "posts", post: p.id })}
                    className="hover:bg-subtle -mx-2 flex items-center gap-3 rounded-md px-2 py-2.5"
                  >
                    <Thumb src={p.thumbnailUrl} />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <b className="truncate font-semibold">{postTitle(p.caption)}</b>
                      <span className="meta truncate">{postMeta(p)}</span>
                    </span>
                    <span className="text-right tabular-nums">
                      <b className="font-semibold">{isPending(p) ? "…" : compact(p.reach)}</b>
                      <br />
                      <span className="meta">reached</span>
                    </span>
                    <span className="hidden w-16 text-right tabular-nums sm:block">
                      <b className="font-semibold">{percent(p.engagementRate)}</b>
                      <br />
                      <span className="meta">engaged</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="flex min-w-0 flex-col gap-5">
          {data.reachByPlatform.length > 0 && (
            <Card title="People reached, by platform">
              <BarList
                ariaLabel={`People reached by platform: ${data.reachByPlatform
                  .map((r) => `${platformName(r.platform)} ${full(r.reach)}`)
                  .join(", ")}.`}
                columns={["Platform", "People reached"]}
                rows={data.reachByPlatform.map((r) => ({
                  label: platformName(r.platform),
                  value: r.reach,
                  display: compact(r.reach),
                  color: platformColor(r.platform),
                }))}
              />
            </Card>
          )}
          <Card title="What stood out">
            {insights.length === 0 ? (
              <p className="text-ink-2">Not enough posts yet to spot a pattern.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {insights.map((i) =>
                  i.kind === "best_time" ? (
                    <li key={i.kind}>
                      Your posts do best on <LocalSlotText slot={i.slot} />.{" "}
                      <Link href={hrefFor({ section: "audience" })} className="font-medium">
                        Audience
                      </Link>
                    </li>
                  ) : (
                    <li key={i.kind}>
                      {insightText(i).before}
                      <b className="font-semibold">{insightText(i).strong}</b>
                      {insightText(i).after}
                    </li>
                  ),
                )}
              </ul>
            )}
            <p className="meta">Worked out from your numbers, not written by AI.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
