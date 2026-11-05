import type { BestTimeSlot } from "@/lib/social/analytics-types";
import { topSlots } from "./best-time";
import { median } from "./format";
import { isPending, type PostMetricRow } from "./posts";

// "What stood out" (T49): a few plain sentences worked out from the numbers by rules, not by AI.
// Each rule says nothing when the data is too thin. Pure.

export type Insight =
  | { kind: "format"; better: string; worse: string; ratio: number }
  | { kind: "best_time"; slot: BestTimeSlot }
  | { kind: "waggle_comments"; comments: number; answered: number };

const PLURAL: Record<string, string> = {
  reel: "reels",
  photo: "photos",
  carousel: "carousels",
  story: "stories",
  video: "videos",
  text: "text posts",
  post: "posts",
};
export const plural = (format: string) => PLURAL[format] ?? `${format} posts`;

/** Formats need this many posts each before they're compared. */
const MIN_POSTS = 2;
/** And a gap at least this big, or it isn't worth a sentence. */
const MIN_RATIO = 1.2;

/** Which format reached more people (median reach), against photos when there are some. */
export function formatRule(posts: PostMetricRow[]): Insight | null {
  const byFormat = new Map<string, number[]>();
  for (const p of posts) {
    if (isPending(p)) continue;
    byFormat.set(p.format, [...(byFormat.get(p.format) ?? []), p.reach]);
  }
  const medians = [...byFormat]
    .filter(([, reach]) => reach.length >= MIN_POSTS)
    .map(([format, reach]) => ({ format, reach: median(reach)! }))
    .sort((a, b) => b.reach - a.reach);
  if (medians.length < 2) return null;
  const photo = medians.find((m) => m.format === "photo");
  const [top, second] = medians;
  const [better, worse] = photo && top.format !== "photo" ? [top, photo] : [top, second];
  if (worse.reach <= 0) return null;
  const ratio = Math.round((better.reach / worse.reach) * 10) / 10;
  return ratio >= MIN_RATIO
    ? { kind: "format", better: better.format, worse: worse.format, ratio }
    : null;
}

/** The slot where past posts did best, if it rests on at least 2 posts. */
export function bestTimeRule(slots: BestTimeSlot[] | null): Insight | null {
  const [best] = topSlots(slots ?? [], 1);
  return best && best.postCount >= MIN_POSTS ? { kind: "best_time", slot: best } : null;
}

/** Comments on posts made in Waggle, and how many Waggle answered on its own. */
export function waggleCommentsRule(
  stats: { comments: number; answered: number } | null,
): Insight | null {
  return stats && stats.comments > 0
    ? { kind: "waggle_comments", comments: stats.comments, answered: stats.answered }
    : null;
}

export function standOut(input: {
  posts: PostMetricRow[];
  bestTimes: BestTimeSlot[] | null;
  waggleComments: { comments: number; answered: number } | null;
}): Insight[] {
  return [
    formatRule(input.posts),
    bestTimeRule(input.bestTimes),
    waggleCommentsRule(input.waggleComments),
  ].filter((i): i is Insight => i !== null);
}

/** The sentence for an insight without a time in it (the best time is shown in local time). */
export function insightText(i: Exclude<Insight, { kind: "best_time" }>): {
  before: string;
  strong: string;
  after: string;
} {
  if (i.kind === "format") {
    const name = plural(i.better);
    return {
      before: `${name.charAt(0).toUpperCase()}${name.slice(1)} reached `,
      strong: `${i.ratio}×`,
      after: ` more people than ${plural(i.worse)}.`,
    };
  }
  const word = i.comments === 1 ? "comment" : "comments";
  return {
    before: "Posts made in Waggle got ",
    strong: `${i.comments.toLocaleString("en-US")} ${word}`,
    after: `; Waggle answered ${i.answered.toLocaleString("en-US")} of them.`,
  };
}
