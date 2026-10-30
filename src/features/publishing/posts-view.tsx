import { CalendarClock, ChevronLeft, ChevronRight, CircleAlert, CircleCheck } from "lucide-react";
import Link from "next/link";
import { getCurrentTenant } from "@/features/tenants";
import { cn } from "cn";
import {
  dayKey,
  monthParam,
  monthWeeks,
  needsNewTime,
  parseDay,
  parseMonth,
  postDay,
  shiftMonth,
  type Month,
} from "./calendar";
import { ComposeCard } from "./compose-card";
import { accountNames, loadPosts, Post, PostsList, type PostRow } from "./posts-list";

// Posts (design v2): a month calendar, because posting is about dates. Each post is a chip on its
// day (check = published, clock = scheduled, amber = needs a new time); click an empty day to
// plan a post for it. The composer is always on the right. List keeps the text view.

type View = "month" | "list";

function url(p: { view: View; month: Month; day?: string; post?: string }) {
  const q = new URLSearchParams();
  if (p.view === "list") q.set("view", "list");
  q.set("month", monthParam(p.month));
  if (p.day) q.set("day", p.day);
  if (p.post) q.set("post", p.post);
  return `/posts?${q}`;
}

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

function Chip({ post, href, selected }: { post: PostRow; href: string; selected: boolean }) {
  const attention = needsNewTime(post);
  const published = post.status === "published";
  const Icon = attention ? CircleAlert : published ? CircleCheck : CalendarClock;
  const at = post.published_at ?? post.scheduled_for;
  return (
    <Link
      href={href}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "relative z-10 flex items-center gap-1 overflow-hidden rounded-lg px-1.5 py-0.5 text-xs whitespace-nowrap",
        attention
          ? "border-honey-border bg-honey-tint text-honey-text border"
          : published
            ? "bg-subtle text-ink-2"
            : "text-ink border-line-strong bg-surface border",
        selected && "outline-ink outline-2",
      )}
    >
      <Icon
        className={cn(
          "size-3.5 shrink-0",
          published && "text-success",
          attention && "text-honey-text",
        )}
        strokeWidth={1.75}
        aria-hidden
      />
      <span className="sr-only">
        {attention ? "Needs a new time: " : published ? "Published: " : "Scheduled: "}
      </span>
      <span className="truncate">
        {at && !attention ? `${time(at)} ` : ""}
        {post.content}
      </span>
    </Link>
  );
}

export async function PostsView({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // Tenant (cookies) first: the calendar reads the current date, which needs a request.
  const tenant = await getCurrentTenant();
  const { posts, accounts } = await loadPosts(tenant.id);
  const str = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  const view: View = str("view") === "list" ? "list" : "month";
  const month = parseMonth(str("month"));
  const day = parseDay(str("day"));
  const postId = str("post");
  const names = accountNames(accounts);
  const selectedPost = postId ? posts.find((p) => p.id === postId) : undefined;
  const attention = posts.filter(needsNewTime);
  const today = dayKey(new Date());
  const byDay = new Map<string, PostRow[]>();
  for (const p of posts) {
    if (p.status === "cancelled" && !p.failure_reason) continue;
    const key = postDay(p);
    byDay.set(key, [...(byDay.get(key) ?? []), p]);
  }
  const monthName = new Date(month.year, month.month - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const thisMonth = parseMonth(undefined);
  const weeks = monthWeeks(month);
  const weekdays = weeks[0].map((d) =>
    new Date(`${d}T12:00`).toLocaleDateString(undefined, { weekday: "short" }),
  );
  const first = attention[0];

  return (
    <>
      <header className="flex flex-wrap items-center gap-x-6 gap-y-3">
        <h1 className="page-title">Posts</h1>
        {view === "month" && (
          <div className="flex items-center gap-1">
            <Link
              href={url({ view, month: shiftMonth(month, -1) })}
              aria-label="Previous month"
              className="border-line-strong bg-surface flex size-11 items-center justify-center rounded-md border"
            >
              <ChevronLeft className="size-5" strokeWidth={1.75} aria-hidden />
            </Link>
            <span className="min-w-[150px] text-center text-lg font-semibold">{monthName}</span>
            <Link
              href={url({ view, month: shiftMonth(month, 1) })}
              aria-label="Next month"
              className="border-line-strong bg-surface flex size-11 items-center justify-center rounded-md border"
            >
              <ChevronRight className="size-5" strokeWidth={1.75} aria-hidden />
            </Link>
            <Link
              href={url({ view, month: thisMonth })}
              className="hover:text-ink text-ink-2 flex min-h-11 items-center px-3.5 text-sm font-medium"
            >
              Today
            </Link>
          </div>
        )}
        <nav aria-label="View" className="segmented ml-auto">
          <Link href={url({ view: "month", month })} data-active={view === "month" || undefined}>
            Month
          </Link>
          <Link href={url({ view: "list", month })} data-active={view === "list" || undefined}>
            List
          </Link>
        </nav>
      </header>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,400px)]">
        <div className="flex min-w-0 flex-col gap-3">
          {first && (
            <div
              role="status"
              className="border-honey-border bg-honey-tint text-honey-text flex flex-wrap items-center gap-3 rounded-md border px-4 py-3 text-sm"
            >
              <CircleAlert
                className="text-honey-text size-5 shrink-0"
                strokeWidth={1.75}
                aria-hidden
              />
              <span className="flex-1">
                <strong className="font-semibold">
                  {attention.length === 1
                    ? "1 post needs a new time."
                    : `${attention.length} posts need a new time.`}
                </strong>{" "}
                &ldquo;{first.content.slice(0, 40)}
                {first.content.length > 40 ? "…" : ""}&rdquo; didn&apos;t go out.
              </span>
              <Link
                href={url({ view, month: parseMonth(postDay(first).slice(0, 7)), post: first.id })}
                className="text-ink border-line-strong bg-surface flex min-h-11 items-center rounded-md border px-4 font-medium"
              >
                Pick a new time
              </Link>
            </div>
          )}

          {view === "list" ? (
            <PostsList posts={posts} names={names} />
          ) : (
            <>
              <div role="grid" aria-label={monthName} className="card overflow-hidden">
                <div
                  role="row"
                  className="text-ink-3 grid grid-cols-7 border-b text-[13px] font-medium"
                >
                  {weekdays.map((w) => (
                    <span key={w} role="columnheader" className="px-2.5 py-2">
                      {w}
                    </span>
                  ))}
                </div>
                {weeks.map((week) => (
                  <div
                    role="row"
                    key={week[0]}
                    className="grid grid-cols-7 border-b last:border-b-0"
                  >
                    {week.map((d) => {
                      const inMonth = d.slice(0, 7) === monthParam(month);
                      const list = byDay.get(d) ?? [];
                      const planned = d === day;
                      const label = new Date(`${d}T12:00`).toLocaleDateString(undefined, {
                        weekday: "long",
                        month: "long",
                        day: "numeric",
                      });
                      const n = Number(d.slice(8));
                      return (
                        <div
                          role="gridcell"
                          key={d}
                          aria-current={d === today ? "date" : undefined}
                          aria-selected={planned || undefined}
                          className={cn(
                            "relative flex min-h-[92px] min-w-0 flex-col gap-1 border-r px-1.5 py-1.5 text-[13px] last:border-r-0 sm:px-2",
                            planned
                              ? "bg-subtle text-honey-text"
                              : inMonth
                                ? "text-ink-3"
                                : "text-ink-3",
                          )}
                        >
                          <Link
                            href={url({ view, month, day: d })}
                            aria-label={`Plan a post for ${label}`}
                            className="hover:after:bg-subtle self-start after:absolute after:inset-0 after:-z-0"
                          >
                            {d === today ? (
                              <span className="bg-honey text-ink relative inline-flex h-[22px] min-w-[22px] items-center justify-center rounded-full px-1 font-semibold">
                                {n}
                              </span>
                            ) : (
                              <span className="relative">
                                {n === 1 && !inMonth
                                  ? new Date(`${d}T12:00`).toLocaleDateString(undefined, {
                                      month: "short",
                                      day: "numeric",
                                    })
                                  : n}
                              </span>
                            )}
                          </Link>
                          {list.slice(0, 3).map((p) => (
                            <Chip
                              key={p.id}
                              post={p}
                              href={url({ view, month, post: p.id })}
                              selected={p.id === postId}
                            />
                          ))}
                          {list.length > 3 && (
                            <span className="text-ink-3 relative text-xs">
                              +{list.length - 3} more
                            </span>
                          )}
                          {planned && (
                            <span className="border-honey/60 text-honey-text relative overflow-hidden rounded-lg border border-dashed px-1.5 py-0.5 text-xs whitespace-nowrap">
                              New post
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
              <p className="meta flex flex-wrap gap-4">
                <span className="inline-flex items-center gap-1.5">
                  <CircleCheck className="text-success size-4" strokeWidth={1.75} aria-hidden />
                  Published
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CalendarClock className="size-4" strokeWidth={1.75} aria-hidden />
                  Scheduled
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CircleAlert className="text-honey-text size-4" strokeWidth={1.75} aria-hidden />
                  Needs a new time
                </span>
                <span>Click a day to plan a post for it.</span>
              </p>
            </>
          )}
        </div>

        <div className="flex flex-col gap-4">
          {selectedPost && (
            <section aria-label="Selected post" className="card flex flex-col px-5 pt-1">
              <div className="flex items-center justify-between pt-3">
                <h2 className="meta">This post</h2>
                <Link
                  href={url({ view, month })}
                  className="text-ink-2 text-sm underline underline-offset-4"
                >
                  Close
                </Link>
              </div>
              <Post post={selectedPost} accounts={names} as="div" />
            </section>
          )}
          <ComposeCard day={day} />
        </div>
      </div>
    </>
  );
}
