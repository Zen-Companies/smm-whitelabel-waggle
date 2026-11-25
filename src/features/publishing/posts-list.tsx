import { CalendarClock, CircleAlert, CircleCheck, CircleSlash, Film, Loader } from "lucide-react";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { needsNewTime, postStatusWord } from "./calendar";
import { CancelPostButton, RetryPostForm, TakeDownButton } from "./post-actions";
import { platformLabel } from "@/lib/social/platforms";
import { mediaKindOf, type PostPlatformResult } from "@/lib/social/types";
import { failedAccounts, type TargetAccount } from "./post-results";
import { dateTimeIn } from "./post-time";

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
}: {
  post: PostRow;
  accounts: Map<string, string>;
  /** The brand's accounts, to name the ones a post failed on. */
  targets?: TargetAccount[];
  /** The zone times are shown in (the calendar renders on the server). */
  timeZone: string;
  as?: "li" | "div";
}) {
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
  const live = post.platform_results.find((r) => r.url)?.url;
  return (
    <Tag className="flex gap-4 py-4">
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
          {live && (
            <a href={live} target="_blank" rel="noreferrer" className="action-link with-arrow">
              View post
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
        <div className="flex flex-wrap gap-2">
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
            />
          )}
        </div>
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
        "id, content, media, status, scheduled_for, queued, published_at, created_at, last_error, failure_reason, target_account_ids, platform_results, zernio_post_id",
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
 * People reached per post (T74a), summed over its platforms, from the analytics sync (T48).
 * Missing until the next sync after the post goes out.
 */
export async function loadReach(tenantId: string, posts: PostRow[]): Promise<Map<string, number>> {
  const ids = [...new Set(posts.flatMap((p) => p.zernio_post_id ?? []))];
  const out = new Map<string, number>();
  if (!ids.length) return out;
  const supabase = await createServerSupabase();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await supabase
      .from("post_metrics")
      .select("zernio_post_id, reach")
      .eq("tenant_id", tenantId)
      .in("zernio_post_id", ids.slice(i, i + 200));
    for (const m of data ?? []) {
      if (m.zernio_post_id) out.set(m.zernio_post_id, (out.get(m.zernio_post_id) ?? 0) + m.reach);
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

/**
 * The List view (design "Posts · Month and List", T74a): When, Post, Where, Status, People
 * reached, and the next step. Needs-you posts first, then upcoming, then the latest posted.
 */
export function PostsTable({
  posts,
  platforms,
  reach,
  openHref,
  timeZone,
}: {
  timeZone: string;
  posts: PostRow[];
  /** Account id → platform label. */
  platforms: Map<string, string>;
  reach: Map<string, number>;
  openHref: (postId: string) => string;
}) {
  const attention = posts.filter(needsNewTime);
  const upcoming = posts
    .filter((p) => ["queued", "scheduled", "publishing"].includes(p.status))
    .sort((a, b) =>
      (a.scheduled_for ?? a.created_at).localeCompare(b.scheduled_for ?? b.created_at),
    );
  const published = posts.filter((p) => p.status === "published").slice(0, 30);
  const rows = [...attention, ...upcoming, ...published];
  if (!rows.length) {
    return (
      <p className="card text-ink-2 p-5">Nothing yet. Plan your first post with the composer.</p>
    );
  }
  return (
    <div className="card overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead className="text-ink-3 border-line border-b text-left text-[13px]">
          <tr>
            <th className="px-4 py-2.5 font-medium">When</th>
            <th className="px-4 py-2.5 font-medium">Post</th>
            <th className="px-4 py-2.5 font-medium">Where</th>
            <th className="px-4 py-2.5 font-medium">Status</th>
            <th className="px-4 py-2.5 text-right font-medium">People reached</th>
            <th className="px-4 py-2.5">
              <span className="sr-only">Action</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const word = postStatusWord(p);
            const at = p.published_at ?? p.scheduled_for;
            const where = [
              ...new Set(p.target_account_ids.map((id) => platforms.get(id)).filter(Boolean)),
            ].join(", ");
            const reached = p.zernio_post_id ? reach.get(p.zernio_post_id) : undefined;
            return (
              <tr key={p.id} className="border-line border-b last:border-b-0">
                <td className="text-ink-2 px-4 py-3 whitespace-nowrap">
                  {at ? dateTimeIn(at, timeZone) : p.queued ? "Next free time" : "Not set"}
                </td>
                <td className="max-w-[280px] truncate px-4 py-3">
                  {p.content.split("\n")[0] || "Photo"}
                </td>
                <td className="text-ink-2 px-4 py-3">{where || "–"}</td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE[word]}`}
                  >
                    {word}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {word === "Posted"
                    ? reached !== undefined
                      ? reached.toLocaleString()
                      : "Soon"
                    : "–"}
                </td>
                <td className="px-4 py-3 text-right whitespace-nowrap">
                  <Link href={openHref(p.id)} className="action-link with-arrow">
                    {word === "Needs you" ? "Pick a new time" : "Open"}
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
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
