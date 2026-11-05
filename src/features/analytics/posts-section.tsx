import { ArrowDown, ArrowUp } from "lucide-react";
import Link from "next/link";
import { platformName } from "@/components/app/time";
import { cn } from "cn";
import type { PostComments, PostDetail } from "./data";
import { compact, formatName, full, percent } from "./format";
import { LocalDateTime } from "./local-time";
import { Card, NoData, Thumb } from "./parts";
import { PostTimeline } from "./post-timeline";
import {
  filterPosts,
  isPending,
  MADE_FILTERS,
  postMeta,
  postTitle,
  SORTS,
  sortPosts,
  timelineStale,
  TYPE_FILTERS,
  type MadeFilter,
  type PostMetricRow,
  type SortDir,
  type SortKey,
  type TypeFilter,
} from "./posts";

// Posts (T50, design: Analytics · Posts).

export interface PostsState {
  made: MadeFilter;
  type: TypeFilter;
  sort: SortKey;
  dir: SortDir;
}

/** Stories have no likes, comments, shares or saves to count. */
const noInteractions = (p: PostMetricRow) => p.format === "story";

function cell(p: PostMetricRow, v: number, text = full(v)) {
  if (isPending(p)) return "…";
  return text;
}

export function PostsSection({
  posts,
  state,
  selected,
  comments,
  period,
  hrefFor,
  csvHref,
  now,
}: {
  posts: PostMetricRow[];
  state: PostsState;
  selected: PostDetail | null;
  comments: PostComments | null;
  period: number;
  hrefFor: (change: Record<string, string | undefined>) => string;
  csvHref: string;
  now: Date;
}) {
  const counts = {
    all: filterPosts(posts, "all", state.type).length,
    waggle: filterPosts(posts, "waggle", state.type).length,
    platform: filterPosts(posts, "platform", state.type).length,
  };
  const rows = sortPosts(filterPosts(posts, state.made, state.type), state.sort, state.dir);
  const keep = { made: state.made, type: state.type, sort: state.sort, dir: state.dir };
  const link = (change: Partial<typeof keep> & { post?: string }) =>
    hrefFor({ ...keep, post: selected?.id, ...change });

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
      <section aria-label="Posts" className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <nav aria-label="Made in" className="segmented flex-wrap">
            {MADE_FILTERS.map((f) => (
              <Link
                key={f.key}
                href={link({ made: f.key, post: undefined })}
                scroll={false}
                data-active={f.key === state.made || undefined}
                aria-current={f.key === state.made ? "true" : undefined}
              >
                {f.label}
                <span className="text-ink-3 ml-1.5 tabular-nums">{counts[f.key]}</span>
              </Link>
            ))}
          </nav>
          <nav aria-label="Type" className="segmented flex-wrap">
            {TYPE_FILTERS.map((f) => (
              <Link
                key={f.key}
                href={link({ type: f.key, post: undefined })}
                scroll={false}
                data-active={f.key === state.type || undefined}
                aria-current={f.key === state.type ? "true" : undefined}
              >
                {f.label}
              </Link>
            ))}
          </nav>
          <a href={csvHref} download className="ml-auto text-sm font-medium">
            Download CSV
          </a>
        </div>

        {rows.length === 0 ? (
          <NoData>
            {posts.length === 0
              ? `No posts in these ${period} days.`
              : "No posts match these filters."}
          </NoData>
        ) : (
          <div className="border-line overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[620px] border-collapse text-sm">
              <caption className="sr-only">
                Posts published in the period, with their numbers
              </caption>
              <thead>
                <tr className="border-line border-b">
                  <th scope="col" className="text-ink-3 px-3 py-2.5 text-left font-medium">
                    Post
                  </th>
                  {SORTS.map((s) => {
                    const active = s.key === state.sort;
                    const dir: SortDir = active && state.dir === "desc" ? "asc" : "desc";
                    return (
                      <th
                        key={s.key}
                        scope="col"
                        aria-sort={
                          active ? (state.dir === "desc" ? "descending" : "ascending") : undefined
                        }
                        className="px-3 py-2.5 text-right font-medium"
                      >
                        <Link
                          href={link({ sort: s.key, dir })}
                          scroll={false}
                          className={cn(
                            "inline-flex items-center gap-1",
                            active ? "text-ink font-semibold" : "text-ink-3 hover:text-ink",
                          )}
                        >
                          {s.label}
                          {active &&
                            (state.dir === "desc" ? (
                              <ArrowDown className="size-3.5" strokeWidth={2} aria-hidden />
                            ) : (
                              <ArrowUp className="size-3.5" strokeWidth={2} aria-hidden />
                            ))}
                        </Link>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {rows.map((p) => {
                  const on = selected?.id === p.id;
                  const none = noInteractions(p);
                  return (
                    <tr
                      key={p.id}
                      className={cn("border-subtle border-b last:border-0", on && "bg-subtle")}
                    >
                      <td className="px-3 py-2">
                        <Link
                          href={link({ post: p.id })}
                          scroll={false}
                          aria-current={on ? "true" : undefined}
                          className="flex items-center gap-3"
                        >
                          <Thumb src={p.thumbnailUrl} size={40} />
                          <span className="flex min-w-0 flex-col">
                            <span className="max-w-[240px] truncate font-medium">
                              {postTitle(p.caption)}
                            </span>
                            <span className="meta truncate">{postMeta(p)}</span>
                          </span>
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right">{cell(p, p.reach)}</td>
                      <td className="px-3 py-2 text-right">{none ? "–" : cell(p, p.likes)}</td>
                      <td className="px-3 py-2 text-right">{none ? "–" : cell(p, p.comments)}</td>
                      <td className="px-3 py-2 text-right">{none ? "–" : cell(p, p.shares)}</td>
                      <td className="px-3 py-2 text-right">{none ? "–" : cell(p, p.saves)}</td>
                      <td className="px-3 py-2 text-right">
                        {cell(p, p.engagementRate, percent(p.engagementRate))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="meta">
          Lifetime totals for each post published in the period. Posts made straight on Instagram or
          Facebook show up within about 90 minutes. &quot;…&quot; means the platform is still
          counting. Click a column to sort; click a post for its detail.
        </p>
      </section>

      {selected ? (
        <PostDetailPanel post={selected} comments={comments} now={now} />
      ) : (
        rows.length > 0 && (
          <aside className="card hidden p-4 lg:block">
            <p className="text-ink-2">Pick a post to see its first 14 days and its comments.</p>
          </aside>
        )
      )}
    </div>
  );
}

function PostDetailPanel({
  post,
  comments,
  now,
}: {
  post: PostDetail;
  comments: PostComments | null;
  now: Date;
}) {
  const plays = post.format === "reel" || post.format === "video";
  const pending = isPending(post);
  const platform = platformName(post.platform);
  return (
    <Card label="Post detail" className="lg:sticky lg:top-4">
      <div className="flex items-start gap-3">
        <Thumb src={post.thumbnailUrl} size={56} />
        <div className="flex min-w-0 flex-col gap-0.5">
          <b className="font-semibold">{postTitle(post.caption)}</b>
          <span className="meta">
            {formatName(post.format)} · {platform}
            {post.publishedAt && (
              <>
                {" · "}
                <LocalDateTime iso={post.publishedAt} />
              </>
            )}
          </span>
          {post.permalink && (
            <a
              href={post.permalink}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium"
            >
              Open on {platform}
            </a>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-2">
        {[
          { label: "Reached", value: pending ? "…" : full(post.reach) },
          plays
            ? { label: "Plays", value: pending ? "…" : full(post.views) }
            : { label: "Seen", value: pending ? "…" : full(post.impressions) },
          { label: "Engaged", value: pending ? "…" : percent(post.engagementRate) },
        ].map((n) => (
          <div key={n.label} className="flex flex-col">
            <dt className="meta">{n.label}</dt>
            <dd className="text-lg font-semibold tabular-nums">{n.value}</dd>
          </div>
        ))}
      </dl>
      {pending && <p className="meta">{platform} is still counting this post.</p>}

      <PostTimeline
        key={post.id}
        postMetricId={post.id}
        initial={post.timeline}
        stale={timelineStale(post, now)}
      />

      <div className="border-line flex flex-col gap-1 border-t pt-3 text-sm">
        <span className="font-medium">Comments on this post</span>
        {!comments || comments.total === 0 ? (
          <span className="text-ink-2">No comments have come in through Waggle yet.</span>
        ) : (
          <>
            <span className="text-ink-2">
              {compact(comments.total)} {comments.total === 1 ? "comment" : "comments"} · Waggle
              answered {comments.byWaggle}, you answered {comments.byYou}
            </span>
            {comments.leads.length > 0 && (
              <span className="text-ink-2">
                {comments.leads.length === 1 ? "1 lead" : `${comments.leads.length} leads`}:{" "}
                {comments.leads.slice(0, 3).map((l, i) => (
                  <span key={l.id}>
                    {i > 0 && ", "}
                    <Link href={`/leads?lead=${l.id}`} className="font-medium">
                      {l.label}
                    </Link>
                  </span>
                ))}
              </span>
            )}
            {comments.spamHidden > 0 && (
              <span className="text-ink-2">
                {comments.spamHidden === 1
                  ? "1 spam comment hidden"
                  : `${comments.spamHidden} spam comments hidden`}
              </span>
            )}
          </>
        )}
      </div>
    </Card>
  );
}
