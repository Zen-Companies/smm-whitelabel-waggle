import Link from "next/link";
import { platformName } from "@/components/app/time";
import {
  ageShares,
  cityName,
  countryName,
  genderLine,
  lastDays,
  shares,
  shareText,
} from "./audience";
import { hourLabel, onlineGrid, peakCell, topSlots, WEEKDAY_NAMES } from "./best-time";
import { BarList } from "./charts/bar-list";
import { ChartTable } from "./charts/chart-table";
import { platformColor } from "./charts/colors";
import { Heatmap } from "./charts/heatmap";
import { LineChart } from "./charts/line-chart";
import type { AnalyticsAccount, AudienceData } from "./data";
import { full, longDate, shortDate } from "./format";
import { BestTimes } from "./local-time";
import { Card, NoData } from "./parts";

// Audience (T51, design: Analytics · Audience).

const TOO_FEW = "Meta shares who follows an account once it has 100 followers.";

export function AudienceSection({
  data,
  accounts,
  period,
  platform,
  where,
  hrefFor,
}: {
  data: AudienceData;
  accounts: AnalyticsAccount[];
  period: number;
  platform: string;
  where: string | undefined;
  hrefFor: (change: Record<string, string | undefined>) => string;
}) {
  const shown = accounts.filter((a) => platform === "all" || a.platform === platform);
  const series = (data.followers?.accounts ?? [])
    .filter((s) => s.socialAccountId && shown.some((a) => a.id === s.socialAccountId))
    .map((s) => ({ ...s, points: lastDays(s.points, period) }))
    .filter((s) => s.points.length > 1);

  const ig = accounts.find((a) => a.platform === "instagram");
  const igAudience = ig ? data.audiences.get(ig.id) : undefined;
  const grid = onlineGrid(igAudience?.online ?? null);
  const peak = grid ? peakCell(grid) : null;
  const slots = topSlots(data.bestTimes ?? [], 3);

  const withDemo = accounts.filter((a) => data.audiences.get(a.id)?.demographics);
  const whereAccount =
    withDemo.find((a) => a.platform === where) ??
    withDemo.find((a) => platform !== "all" && a.platform === platform) ??
    withDemo[0];
  const whereDemo = whereAccount ? data.audiences.get(whereAccount.id)!.demographics! : null;
  const cities = whereDemo ? shares(whereDemo, "city").slice(0, 5) : [];
  const countries = whereDemo ? shares(whereDemo, "country").slice(0, 3) : [];
  const igDemo = igAudience?.demographics ?? null;
  const ages = igDemo ? ageShares(igDemo) : [];
  const gender = igDemo ? genderLine(igDemo) : null;

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card
        title="Followers"
        className="lg:col-span-2"
        aside={
          <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="meta">Updated once a day</span>
            {series.map((s) => {
              const first = s.points[0].followers;
              const last = s.points[s.points.length - 1].followers;
              const gained = last - first;
              return (
                <span key={s.socialAccountId} className="inline-flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className="size-2 rounded-[2px]"
                    style={{ background: platformColor(s.platform ?? "") }}
                  />
                  {platformName(s.platform)} {full(last)}{" "}
                  <b
                    className={
                      gained >= 0 ? "text-success font-semibold" : "text-danger font-semibold"
                    }
                  >
                    {gained >= 0 ? `▲ ${full(gained)}` : `▼ ${full(-gained)}`}
                  </b>
                </span>
              );
            })}
          </span>
        }
      >
        {series.length === 0 ? (
          <NoData>Follower counts arrive once a day. The first ones show by tomorrow.</NoData>
        ) : (
          <>
            <div className="grid gap-5 md:grid-cols-2">
              {series.map((s) => {
                const name = `${platformName(s.platform)}${s.username ? ` @${s.username}` : ""}`;
                const first = s.points[0];
                const last = s.points[s.points.length - 1];
                return (
                  <div key={s.socialAccountId} className="flex min-w-0 flex-col gap-1.5">
                    <span className="text-sm font-semibold">{platformName(s.platform)}</span>
                    <LineChart
                      ariaLabel={`${name} followers went from ${full(first.followers)} on ${shortDate(first.date)} to ${full(last.followers)} on ${shortDate(last.date)}.`}
                      xLabels={s.points.map((p) => shortDate(p.date))}
                      xTitles={s.points.map((p) => longDate(p.date))}
                      series={[
                        {
                          name: "Followers",
                          color: platformColor(s.platform ?? ""),
                          values: s.points.map((p) => p.followers),
                        },
                      ]}
                      unit="followers"
                      zero={false}
                      height={170}
                    />
                    <ChartTable
                      caption={`${name} followers`}
                      columns={["Day", "Followers"]}
                      rows={s.points.map((p) => [longDate(p.date), full(p.followers)])}
                    />
                  </div>
                );
              })}
            </div>
            {series.length > 1 && (
              <p className="meta">One chart per platform, each on its own scale.</p>
            )}
          </>
        )}
      </Card>

      {ig && (
        <Card
          title="When your Instagram followers are online"
          className="lg:col-span-2"
          aside={<span className="meta">Last 30 days</span>}
        >
          {grid && peak ? (
            <>
              <Heatmap
                ariaLabel={`Instagram followers online by weekday and hour. Busiest: ${WEEKDAY_NAMES[peak.dayOfWeek]} at ${hourLabel(peak.hour)}, about ${full(peak.value)} online.`}
                grid={grid}
              />
              <p className="meta">
                Hours as Meta reports them. Meta doesn&apos;t say which time zone it uses.
              </p>
              <ChartTable
                caption="Instagram followers online, average per weekday and hour"
                columns={["Day", ...[0, 3, 6, 9, 12, 15, 18, 21].map((h) => hourLabel(h))]}
                rows={grid.map((row, d) => [
                  WEEKDAY_NAMES[d],
                  ...[0, 3, 6, 9, 12, 15, 18, 21].map((h) => full(row[h])),
                ])}
              />
            </>
          ) : (
            <NoData>{TOO_FEW}</NoData>
          )}
          {slots.length > 0 && (
            <div className="border-line border-t pt-3">
              <BestTimes slots={slots} />
            </div>
          )}
        </Card>
      )}
      {!ig && slots.length > 0 && (
        <Card title="Best times to post" className="lg:col-span-2">
          <BestTimes slots={slots} />
        </Card>
      )}

      {ig && (
        <Card title="Who follows you on Instagram">
          {ages.length ? (
            <>
              <p className="meta">Share of followers by age.{gender ? ` ${gender}` : ""}</p>
              <BarList
                ariaLabel={`Instagram followers by age: ${ages.map((a) => `${a.label} ${shareText(a.share)}`).join(", ")}.`}
                columns={["Age", "Share of followers"]}
                max={Math.max(...ages.map((a) => a.share))}
                rows={ages.map((a) => ({
                  label: a.label,
                  value: a.share,
                  display: shareText(a.share),
                }))}
              />
            </>
          ) : (
            <NoData>{TOO_FEW}</NoData>
          )}
        </Card>
      )}

      <Card
        title="Where they are"
        className={ig ? undefined : "lg:col-span-2"}
        aside={
          withDemo.length > 1 && (
            <nav aria-label="Platform" className="segmented">
              {withDemo.map((a) => (
                <Link
                  key={a.id}
                  href={hrefFor({ where: a.platform })}
                  scroll={false}
                  data-active={a.id === whereAccount?.id || undefined}
                  aria-current={a.id === whereAccount?.id ? "true" : undefined}
                >
                  {platformName(a.platform)}
                </Link>
              ))}
            </nav>
          )
        }
      >
        {cities.length || countries.length ? (
          <>
            {cities.length > 0 && (
              <>
                <span className="meta">Top cities</span>
                <BarList
                  ariaLabel={`Top cities: ${cities.map((c) => `${cityName(c.key)} ${shareText(c.share)}`).join(", ")}.`}
                  columns={["City", "Share of followers"]}
                  max={Math.max(...cities.map((c) => c.share))}
                  rows={cities.map((c) => ({
                    label: cityName(c.key),
                    value: c.share,
                    display: shareText(c.share),
                  }))}
                />
              </>
            )}
            {countries.length > 0 && (
              <p className="meta">
                {countries.map((c) => `${countryName(c.key)} ${shareText(c.share)}`).join(" · ")}
              </p>
            )}
          </>
        ) : (
          <NoData>{TOO_FEW}</NoData>
        )}
      </Card>
    </div>
  );
}
