"use client";

import { useEffect, useState } from "react";
import type { PostTimelinePoint } from "@/lib/social/analytics-types";
import { fetchPostTimeline } from "./actions";
import { ChartTable } from "./charts/chart-table";
import { SERIES_1 } from "./charts/colors";
import { LineChart } from "./charts/line-chart";
import { full } from "./format";
import { cumulativeReach, earlyShareLine } from "./posts";

/**
 * "Reached, first 14 days" in the post detail. Drawn from the stored copy; a missing or stale one
 * is fetched once (the server action caches it), showing "…" meanwhile.
 */
export function PostTimeline({
  postMetricId,
  initial,
  stale,
}: {
  postMetricId: string;
  initial: PostTimelinePoint[] | null;
  stale: boolean;
}) {
  const [state, setState] = useState<{ points: PostTimelinePoint[] | null; error?: string }>({
    points: initial,
  });
  const [loading, setLoading] = useState(stale);

  useEffect(() => {
    if (!stale) return;
    let live = true;
    fetchPostTimeline(postMetricId)
      .then((r) => {
        if (!live) return;
        setState("points" in r ? { points: r.points } : { points: initial, error: r.error });
      })
      .catch(() => {
        if (live) setState({ points: initial, error: "Couldn't load the first 14 days." });
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [postMetricId, stale, initial]);

  const values = state.points ? cumulativeReach(state.points) : [];
  const line = earlyShareLine(values);

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">Reached, first 14 days</span>
      {values.length > 1 ? (
        <>
          <LineChart
            ariaLabel={`Reach over the first ${values.length} days: ${full(values[values.length - 1])} by day ${values.length}.${line ? ` ${line}` : ""}`}
            xLabels={values.map((_, i) => `Day ${i + 1}`)}
            xTitles={values.map((_, i) => `Day ${i + 1}`)}
            series={[{ name: "Reached", color: SERIES_1, values }]}
            unit="reached"
            height={130}
          />
          {line && <span className="meta">{line}</span>}
          <ChartTable
            caption="Reached, first 14 days"
            columns={["Day", "Reached so far"]}
            rows={values.map((v, i) => [`Day ${i + 1}`, full(v)])}
          />
        </>
      ) : loading ? (
        <span className="meta" role="status">
          … Getting this post&apos;s first days
        </span>
      ) : (
        <span className="meta" role={state.error ? "alert" : undefined}>
          {state.error ?? "No day-by-day numbers for this post yet."}
        </span>
      )}
    </div>
  );
}
