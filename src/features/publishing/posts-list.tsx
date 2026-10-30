import { CalendarClock, CircleAlert, CircleCheck, CircleSlash, Loader } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase/server";
import { needsNewTime } from "./calendar";
import { CancelPostButton, RetryPostForm } from "./post-actions";

// Posts (PRD F3): one post with its status and actions, and the List view. Read through RLS.

export interface PostRow {
  id: string;
  content: string;
  media: { url?: string }[];
  status: string;
  scheduled_for: string | null;
  published_at: string | null;
  created_at: string;
  last_error: string | null;
  failure_reason: string | null;
  target_account_ids: string[];
  platform_results: {
    platform: string;
    status: string;
    url: string | null;
    error: string | null;
  }[];
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

/** Status is inline text + icon, never a colored chip (design.md §3). */
function Status({ post }: { post: PostRow }) {
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
        {post.scheduled_for ? `Scheduled for ${fmt(post.scheduled_for)}` : "Waiting to post"}
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
  as: Tag = "li",
}: {
  post: PostRow;
  accounts: Map<string, string>;
  as?: "li" | "div";
}) {
  const issue = problem(post);
  const image = post.media[0]?.url;
  const live = post.platform_results.find((r) => r.url)?.url;
  return (
    <Tag className="flex gap-4 py-4">
      {image && (
        // eslint-disable-next-line @next/next/no-img-element -- remote post media, any host
        <img src={image} alt="" className="size-16 shrink-0 rounded-lg border object-cover" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <p className="line-clamp-3 whitespace-pre-wrap">{post.content}</p>
        <div className="meta flex flex-wrap gap-x-3">
          <span>
            {post.target_account_ids.map((id) => accounts.get(id) ?? "account").join(", ")}
          </span>
          {live && (
            <a href={live} target="_blank" rel="noreferrer" className="underline">
              View post
            </a>
          )}
        </div>
        <Status post={post} />
        {issue && <p className="danger-box">{issue}</p>}
        <div className="flex flex-wrap gap-2">
          {(post.status === "scheduled" || post.status === "queued") && (
            <CancelPostButton postId={post.id} />
          )}
          {(post.status === "failed" ||
            post.status === "partial" ||
            (post.status === "cancelled" && post.failure_reason)) && (
            <RetryPostForm
              postId={post.id}
              label={post.failure_reason === "zernio_paused" ? "Post now" : "Try again"}
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
  new Map(
    accounts.map((a) => [
      a.id,
      `${a.platform === "facebook" ? "Facebook" : "Instagram"} @${a.username ?? "account"}`,
    ]),
  );

export async function loadPosts(tenantId: string) {
  const supabase = await createServerSupabase();
  const [{ data: posts }, { data: accounts }] = await Promise.all([
    supabase
      .from("posts")
      .select(
        "id, content, media, status, scheduled_for, published_at, created_at, last_error, failure_reason, target_account_ids, platform_results",
      )
      .eq("tenant_id", tenantId)
      .neq("status", "draft")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("social_accounts")
      .select("id, platform, username, status")
      .eq("tenant_id", tenantId),
  ]);
  return {
    posts: (posts ?? []) as unknown as PostRow[],
    accounts: accounts ?? [],
  };
}

/** The List view: needs attention, upcoming, published. */
export function PostsList({ posts, names }: { posts: PostRow[]; names: Map<string, string> }) {
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
            <Post key={p.id} post={p} accounts={names} />
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
