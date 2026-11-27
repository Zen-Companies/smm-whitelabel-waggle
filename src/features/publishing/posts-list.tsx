import { CalendarClock, CircleAlert, CircleCheck, CircleSlash, Film, Loader } from "lucide-react";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { needsNewTime, postStatusWord } from "./calendar";
import { buttonVariants } from "@/components/ui/button";
import {
  CancelPostButton,
  FixTextButton,
  MovePostButton,
  RetryPostForm,
  TakeDownButton,
  type PickerContext,
} from "./post-actions";
import { platformLabel } from "@/lib/social/platforms";
import { mediaKindOf, type PostPlatformResult } from "@/lib/social/types";
import { canMove } from "./move";
import { failedAccounts, type TargetAccount } from "./post-results";
import { dateTimeIn, dayKeyIn } from "./post-time";
import { googleEnded } from "./google-post";
import { parsePostOptions } from "./post-options";
import { HowItDid } from "./how-it-did";
import { engagementCell, showNum, type MetricRow, type PostResults } from "./post-metrics";

const DONE: Record<"edited" | "copied", string> = {
  edited: "Changes saved. The post goes out with them.",
  copied: "Copied. It's a new post on the calendar.",
};

// Posts (PRD F3): one post with its status and actions, and the List view. Read through RLS.

export interface PostRow {
  id: string;
  content: string;
  media: { url?: string; type?: string | null }[];
  status: string;
  scheduled_for: string | null;
  queued: boolean;
  published_at: string | null;
  created_at: string;
  last_error: string | null;
  failure_reason: string | null;
  target_account_ids: string[];
  /** Zernio's id once the post was sent (T74a: reach from analytics). */
  zernio_post_id?: string | null;
  platform_results: PostPlatformResult[];
  /** Round 4: per-platform choices (a Google offer or event's end hides Fix the text there). */
  platform_options?: unknown;
}

/** Status is inline text + icon, never a colored chip (design.md §3). */
function Status({ post, timeZone }: { post: PostRow; timeZone: string }) {
  const fmt = (iso: string) => dateTimeIn(iso, timeZone);
  const s = post.status;
  if (s === "published")
    return (
      <span className="inline-flex items-center gap-1.5 text-sm">
        <CircleCheck className="text-success" strokeWidth={1.75} aria-hidden />
        Published{post.published_at ? ` ${fmt(post.published_at)}` : ""}
      </span>
    );
  if (s === "scheduled" || s === "queued")
    return (
      <span className="inline-flex items-center gap-1.5 text-sm">
        <CalendarClock strokeWidth={1.75} aria-hidden />
        {post.scheduled_for
          ? `Scheduled for ${fmt(post.scheduled_for)}`
          : post.queued
            ? "Next free slot"
            : "Waiting to post"}
      </span>
    );
  if (s === "publishing")
    return (
      <span className="inline-flex items-center gap-1.5 text-sm">
        <Loader strokeWidth={1.75} aria-hidden />
        Posting now
      </span>
    );
  if (s === "cancelled")
    return (
      <span className="inline-flex items-center gap-1.5 text-sm">
        <CircleSlash strokeWidth={1.75} aria-hidden />
        {post.failure_reason === "account_removed"
          ? "Cancelled: its account was removed"
          : post.failure_reason === "taken_down"
            ? "Taken down"
            : "Cancelled"}
      </span>
    );
  return (
    <span className="text-honey-text inline-flex items-center gap-1.5 text-sm">
      <CircleAlert className="text-honey-text" strokeWidth={1.75} aria-hidden />
      {s === "partial" ? "Posted to some accounts only" : "Not posted"}
    </span>
  );
}

function problem(post: PostRow): string | null {
  if (post.failure_reason === "zernio_paused") {
    return "This post was due while posting was paused on our side, so it didn't go out. Pick a new time.";
  }
  if (post.failure_reason === "account_removed") {
    return "Its account was disconnected for too long, so the post was cancelled. Reconnect, then reschedule.";
  }
  if (post.status === "failed" || post.status === "partial") {
    return post.last_error ?? "It couldn't be posted.";
  }
  return null;
}

export function Post({
  post,
  accounts,
  targets = [],
  timeZone,
  as: Tag = "li",
  picker,
  editHref,
  duplicateHref,
  done = null,
  results = null,
  now,
}: {
  post: PostRow;
  accounts: Map<string, string>;
  /** The brand's accounts, to name the ones a post failed on. */
  targets?: TargetAccount[];
  /** The zone times are shown in (the calendar renders on the server). */
  timeZone: string;
  as?: "li" | "div";
  /** Round 3: the picker's best times and busy days (Move, Pick a time). */
  picker?: PickerContext;
  /** Round 3: Edit and Duplicate open the big window on these addresses. */
  editHref?: string;
  duplicateHref?: string;
  /** Round 3: what just happened to this post, said in place. */
  done?: "edited" | "copied" | null;
  /** Round 4: its numbers from the hourly copy, for "How it did" (published posts only). */
  results?: PostResults | null;
  now?: Date;
}) {
  const pick: PickerContext = picker ?? { timeZone, chips: null, busyDays: [] };
  // The platforms it's live on (older rows kept no per-platform results: all its accounts).
  const livePlatforms = post.platform_results.length
    ? [
        ...new Set(
          post.platform_results.filter((r) => r.status === "published").map((r) => r.platform),
        ),
      ]
    : [
        ...new Set(
          targets.filter((t) => post.target_account_ids.includes(t.id)).map((t) => t.platform),
        ),
      ];
  // Round 4: Google deletes an offer or event once it ends, so Fix the text skips Google then.
  const fixPlatforms = googleEnded(
    parsePostOptions(post.platform_options).googlebusiness?.google,
    dayKeyIn(now ?? new Date(), timeZone),
  )
    ? livePlatforms.filter((p) => p !== "googlebusiness")
    : livePlatforms;
  const planned = canMove(post) && !!post.scheduled_for;
  const failed =
    post.status === "partial" || post.status === "failed"
      ? failedAccounts(
          post.platform_results ?? [],
          targets.filter((t) => post.target_account_ids.includes(t.id)),
        )
      : [];
  // Each failed account is named with its reason; the row's summary only when there's none.
  const issue = failed.length && !post.failure_reason ? null : problem(post);
  const first = post.media[0];
  const isVideo =
    !!first?.url &&
    mediaKindOf({
      url: first.url,
      type: first.type === "video" ? "video" : null,
    }) === "video";
  const live = post.platform_results.find((r) => r.url);
  return (
    <Tag className="flex flex-wrap gap-4 py-4">
      {done && (
        <p
          role="status"
          className="bg-success-soft text-success w-full rounded-xl px-3 py-2 text-sm"
        >
          {DONE[done]}
        </p>
      )}
      {first?.url &&
        (isVideo ? (
          // A video's first frame, never an <img> (it shows as broken).
          <span className="bg-subtle relative size-16 shrink-0 overflow-hidden rounded-lg border">
            <video
              src={first.url}
              preload="metadata"
              muted
              playsInline
              aria-hidden
              className="size-full object-cover"
            />
            <Film
              className="text-ink-2 absolute right-1 bottom-1 size-4"
              strokeWidth={1.75}
              aria-label="Video"
            />
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- remote post media, any host
          <img src={first.url} alt="" className="size-16 shrink-0 rounded-lg border object-cover" />
        ))}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="line-clamp-3 whitespace-pre-wrap">{post.content}</p>
        <div className="meta flex flex-wrap gap-x-3">
          <span>
            {post.target_account_ids.map((id) => accounts.get(id) ?? "account").join(", ")}
          </span>
          {live?.url && (
            <a href={live.url} target="_blank" rel="noreferrer" className="action-link with-arrow">
              See it on {platformLabel(live.platform)}
            </a>
          )}
        </div>
        <Status post={post} timeZone={timeZone} />
        {issue && <p className="danger-box">{issue}</p>}
        {failed.length > 0 && (
          <ul className="danger-box flex flex-col gap-1.5" aria-label="Not posted on">
            {failed.map((f) => (
              <li key={f.key}>
                <b className="font-semibold">{f.name}</b>: {f.reason}
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-start gap-2">
          {planned && editHref && (
            <Link href={editHref} scroll={false} className={buttonVariants({ variant: "primary" })}>
              Edit
            </Link>
          )}
          {planned && post.scheduled_for && (
            <MovePostButton postId={post.id} scheduledFor={post.scheduled_for} picker={pick} />
          )}
          {post.status === "published" && (fixPlatforms.length > 0 || !livePlatforms.length) && (
            <FixTextButton postId={post.id} content={post.content} platforms={fixPlatforms} />
          )}
          {duplicateHref &&
            ["scheduled", "queued", "published", "partial"].includes(post.status) && (
              <Link
                href={duplicateHref}
                scroll={false}
                className={buttonVariants({ variant: "secondary" })}
              >
                Duplicate
              </Link>
            )}
          {(post.status === "scheduled" || post.status === "queued") && (
            <CancelPostButton postId={post.id} />
          )}
          {(post.status === "published" || post.status === "partial") && (
            <TakeDownButton
              postId={post.id}
              platforms={[
                ...new Set(
                  post.platform_results
                    .filter((r) => r.status !== "removed")
                    .map((r) => r.platform),
                ),
              ]}
            />
          )}
          {(post.status === "failed" ||
            post.status === "partial" ||
            (post.status === "cancelled" &&
              post.failure_reason &&
              post.failure_reason !== "taken_down")) && (
            <RetryPostForm
              postId={post.id}
              label={post.failure_reason === "zernio_paused" ? "Post now" : "Try again"}
              // Already live on some accounts: only "Try again" (a new time would post it twice).
              canPickTime={post.status !== "partial"}
              picker={pick}
            />
          )}
        </div>
        {results && (post.status === "published" || post.status === "partial") && (
          <HowItDid results={results} now={now ?? new Date()} />
        )}
      </div>
    </Tag>
  );
}

export const accountNames = (
  accounts: { id: string; platform: string; username: string | null }[],
) =>
  new Map(accounts.map((a) => [a.id, `${platformLabel(a.platform)} @${a.username ?? "account"}`]));

export async function loadPosts(tenantId: string) {
  const supabase = await createServerSupabase();
  const [{ data: posts }, { data: accounts }] = await Promise.all([
    supabase
      .from("posts")
      .select(
        "id, content, media, status, scheduled_for, queued, published_at, created_at, last_error, failure_reason, target_account_ids, platform_results, zernio_post_id, platform_options",
      )
      .eq("tenant_id", tenantId)
      .neq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("social_accounts")
      .select("id, platform, username, status, zernio_account_id")
      .eq("tenant_id", tenantId),
  ]);
  return {
    posts: (posts ?? []) as unknown as PostRow[],
    accounts: accounts ?? [],
  };
}

/**
 * Each sent post's numbers (T74a reach, Round 4 results), by Zernio post id, from the analytics
 * sync's copy (T48). Missing until the next sync after the post goes out; never calls Zernio.
 */
export async function loadMetrics(
  tenantId: string,
  posts: PostRow[],
): Promise<Map<string, MetricRow[]>> {
  const ids = [...new Set(posts.flatMap((p) => p.zernio_post_id ?? []))];
  const out = new Map<string, MetricRow[]>();
  if (!ids.length) return out;
  const supabase = await createServerSupabase();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase
      .from("post_metrics")
      .select(
        "zernio_post_id, platform, sync_status, reach, impressions, likes, comments, shares, saves, views, synced_at",
      )
      .eq("tenant_id", tenantId)
      .in("zernio_post_id", ids.slice(i, i + 200));
    for (const m of data ?? []) {
      if (m.zernio_post_id) out.set(m.zernio_post_id, [...(out.get(m.zernio_post_id) ?? []), m]);
    }
  }
  return out;
}

const STATUS_TONE: Record<string, string> = {
  Posted: "bg-success-soft text-success",
  Planned: "bg-subtle text-ink-2",
  Posting: "bg-subtle text-ink-2",
  "Needs you": "bg-honey-tint text-honey-text",
};

/** The List view's two number cells for one post (board 3b): reached, then engagement. */
function numberCells(word: string, r: PostResults | null): { reached: string; engagement: string } {
  if (word !== "Posted") {
    return word === "Planned" || word === "Posting"
      ? { reached: "Not yet", engagement: "Not yet" }
      : { reached: "–", engagement: "–" };
  }
  if (r?.noneShare) return { reached: "Google doesn't share", engagement: "–" };
  if (!r?.hasNumbers) return { reached: "Soon", engagement: "Soon" };
  return { reached: showNum(r.reached), engagement: engagementCell(r) };
}

/**
 * The List view (design "Posts · Month and List", T74a; Round 4 adds Engagement): When, Post,
 * Where, Status, People reached, Engagement, and the next step. Needs-you posts first, then
 * upcoming, then the latest posted. On a phone each post is a card instead of a wide table.
 */
export function PostsTable({
  posts,
  platforms,
  results,
  openHref,
  timeZone,
}: {
  timeZone: string;
  posts: PostRow[];
  /** Account id → platform label. */
  platforms: Map<string, string>;
  /** Round 4: a sent post's numbers from the hourly copy, or null. */
  results: (post: PostRow) => PostResults | null;
  openHref: (postId: string) => string;
}) {
  const attention = posts.filter(needsNewTime);
  const upcoming = posts
    .filter((p) => ["queued", "scheduled", "publishing"].includes(p.status))
    .sort((a, b) =>
      (a.scheduled_for ?? a.created_at).localeCompare(b.scheduled_for ?? b.created_at),
    );
  const published = posts.filter((p) => p.status === "published").slice(0, 30);
  const rows = [...attention, ...upcoming, ...published].map((p) => {
    const word = postStatusWord(p);
    const at = p.published_at ?? p.scheduled_for;
    return {
      p,
      word,
      when: at ? dateTimeIn(at, timeZone) : p.queued ? "Next free time" : "Not set",
      title: p.content.split("\n")[0] || "Photo",
      where: [...new Set(p.target_account_ids.map((id) => platforms.get(id)).filter(Boolean))].join(
        ", ",
      ),
      cells: numberCells(word, results(p)),
      action: word === "Needs you" ? "Pick a new time" : "Open",
    };
  });
  if (!rows.length) {
    return (
      <p className="card text-ink-2 p-5">Nothing yet. Plan your first post with the composer.</p>
    );
  }
  const statusChip = (word: string) => (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE[word]}`}>
      {word}
    </span>
  );
  return (
    <>
      {/* Phone (board P5): stacked cards, each with people reached and engagement. */}
      <ul className="flex flex-col gap-2 md:hidden" aria-label="Posts">
        {rows.map((r) => (
          <li key={r.p.id} className="card flex flex-col gap-2.5 p-4">
            <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
              <span className="flex min-w-[200px] flex-1 flex-col gap-0.5">
                <b className="text-sm font-semibold">{r.title}</b>
                <span className="meta">
                  {r.when}
                  {r.where ? ` · ${r.where}` : ""}
                </span>
              </span>
              {statusChip(r.word)}
            </div>
            <dl className="grid grid-cols-2 gap-2">
              <div className="flex flex-col-reverse">
                <dt className="text-ink-3 text-xs">People reached</dt>
                <dd className="text-sm font-semibold tabular-nums">{r.cells.reached}</dd>
              </div>
              <div className="flex flex-col-reverse">
                <dt className="text-ink-3 text-xs">Engagement</dt>
                <dd className="text-sm font-semibold tabular-nums">{r.cells.engagement}</dd>
              </div>
            </dl>
            <Link href={openHref(r.p.id)} className="action-link with-arrow self-start text-sm">
              {r.action}
            </Link>
          </li>
        ))}
      </ul>
      <div className="card hidden overflow-x-auto md:block">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-ink-3 border-line border-b text-left text-[13px]">
            <tr>
              <th className="px-4 py-2.5 font-medium">When</th>
              <th className="px-4 py-2.5 font-medium">Post</th>
              <th className="px-4 py-2.5 font-medium">Where</th>
              <th className="px-4 py-2.5 font-medium">Status</th>
              <th className="px-4 py-2.5 text-right font-medium">People reached</th>
              <th className="px-4 py-2.5 text-right font-medium">Engagement</th>
              <th className="px-4 py-2.5">
                <span className="sr-only">Action</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.p.id} className="border-line border-b last:border-b-0">
                <td className="text-ink-2 px-4 py-3 whitespace-nowrap">{r.when}</td>
                <td className="max-w-[260px] truncate px-4 py-3">{r.title}</td>
                <td className="text-ink-2 px-4 py-3">{r.where || "–"}</td>
                <td className="px-4 py-3">{statusChip(r.word)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.cells.reached}</td>
                <td className="px-4 py-3 text-right tabular-nums">{r.cells.engagement}</td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Link href={openHref(r.p.id)} className="action-link with-arrow">
                    {r.action}
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="meta">
        Engagement is likes, comments, shares and saves, and that as a share of the people who saw
        it.
      </p>
    </>
  );
}

/** The List view: needs attention, upcoming, published. */
export function PostsList({
  posts,
  names,
  timeZone,
}: {
  posts: PostRow[];
  names: Map<string, string>;
  timeZone: string;
}) {
  const attention = posts.filter(needsNewTime);
  const upcoming = posts
    .filter((p) => ["queued", "scheduled", "publishing"].includes(p.status))
    .sort((a, b) =>
      (a.scheduled_for ?? a.created_at).localeCompare(b.scheduled_for ?? b.created_at),
    );
  const published = posts.filter((p) => p.status === "published").slice(0, 20);

  const section = (title: string, list: PostRow[], empty: string) => (
    <section className="flex flex-col gap-2" aria-label={title}>
      <h2 className="section-title">
        {title} <span className="meta">({list.length})</span>
      </h2>
      {list.length === 0 ? (
        <p className="meta">{empty}</p>
      ) : (
        <ul className="divide-y">
          {list.map((p) => (
            <Post key={p.id} post={p} accounts={names} timeZone={timeZone} />
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <div className="card flex flex-col gap-8 p-5">
      {attention.length > 0 && section("Needs attention", attention, "")}
      {section("Upcoming", upcoming, "Nothing scheduled. Plan one with the composer.")}
      {section("Published", published, "Your published posts show up here.")}
    </div>
  );
}
