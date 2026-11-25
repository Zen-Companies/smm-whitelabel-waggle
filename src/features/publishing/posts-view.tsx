import { CalendarClock, ChevronLeft, ChevronRight, CircleAlert, CircleCheck } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { SidePanel } from "@/components/app/side-panel";
import { NotConnectedYet } from "@/features/accounts";
import { can } from "@/features/orgs";
import { getCurrentTenant } from "@/features/tenants";
import { viewerTimeZone } from "@/lib/time/viewer-zone";
import { cn } from "cn";
import {
  monthParam,
  monthWeeks,
  needsNewTime,
  parseDay,
  parseTime,
  parseMonth,
  postDay,
  postStatusWord,
  shiftMonth,
  shiftWeek,
  weekDays,
  weekLabel,
  weekStart,
  weekSummary,
  type Month,
} from "./calendar";
import { ComposeCard } from "./compose-card";
import { EmptyCell } from "@/components/app/empty-spot";
import { StateLabel } from "@/components/app/state-mark";
import { PostsHeader } from "./posts-header";
import { platformLabel } from "@/lib/social/platforms";
import { accountNames, loadPosts, loadReach, Post, PostsTable, type PostRow } from "./posts-list";
import { clockIn, dayKeyIn, zoneLine } from "./post-time";

// Posts (design "5 · Posts", T74a): the week by default (each day a column with its posts and
// "+ Plan a post"), a month calendar, or the list with people reached. The composer is always on
// the right.

type View = "week" | "month" | "list";

function url(p: {
  view: View;
  month: Month;
  week?: string;
  day?: string;
  post?: string;
  /** The composer panel, open with no day picked. */
  compose?: boolean;
}) {
  const q = new URLSearchParams();
  if (p.view !== "week") q.set("view", p.view);
  if (p.view === "week" && p.week) q.set("week", p.week);
  else q.set("month", monthParam(p.month));
  if (p.day) q.set("day", p.day);
  if (p.post) q.set("post", p.post);
  if (p.compose) q.set("new", "1");
  return `/posts?${q}`;
}

function Chip({
  post,
  href,
  selected,
  timeZone,
}: {
  post: PostRow;
  href: string;
  selected: boolean;
  timeZone: string;
}) {
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
        {at && !attention ? `${clockIn(at, timeZone)} ` : ""}
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
  const [{ posts, accounts }, timeZone] = await Promise.all([
    loadPosts(tenant.id),
    // Times and days in the viewer's zone, the one the composer schedules in (the server is UTC).
    viewerTimeZone(),
  ]);
  // Nothing connected and nothing posted yet: one line into setup's Connect step (20 Nov).
  if (!accounts.length && !posts.length) {
    return (
      <>
        <PostsHeader />
        <NotConnectedYet brandName={tenant.name} canConnect={can(tenant.role, "accounts.manage")} />
      </>
    );
  }
  const str = (k: string) => (typeof params[k] === "string" ? (params[k] as string) : undefined);
  const view: View = str("view") === "list" ? "list" : str("view") === "month" ? "month" : "week";
  const day = parseDay(str("day"));
  const today = dayKeyIn(new Date(), timeZone);
  const week = weekStart(parseDay(str("week")) ?? day ?? today);
  const month =
    view === "week"
      ? parseMonth(week.slice(0, 7))
      : parseMonth(str("month") ?? today.slice(0, 7));
  const time = day ? parseTime(str("time")) : null;
  const postId = str("post");
  const composing = str("new") === "1";
  const names = accountNames(accounts);
  const selectedPost = postId ? posts.find((p) => p.id === postId) : undefined;
  const attention = posts.filter(needsNewTime);
  const byDay = new Map<string, PostRow[]>();
  for (const p of posts) {
    if (p.status === "cancelled" && !p.failure_reason) continue;
    const key = postDay(p, timeZone);
    byDay.set(key, [...(byDay.get(key) ?? []), p]);
  }
  const monthName = new Date(month.year, month.month - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
  const thisMonth = parseMonth(today.slice(0, 7));
  const weeks = monthWeeks(month);
  const weekdays = weeks[0].map((d) =>
    new Date(`${d}T12:00`).toLocaleDateString(undefined, { weekday: "short" }),
  );
  const first = attention[0];
  const days = weekDays(week);
  const weekPosts = days.flatMap((d) => byDay.get(d) ?? []);
  const platformOfAccount = new Map(accounts.map((a) => [a.id, platformLabel(a.platform)]));
  const reach = view === "list" ? await loadReach(tenant.id, posts) : new Map<string, number>();

  return (
    <>
      <PostsHeader />
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {view === "week" && (
          <div className="flex flex-wrap items-center gap-1">
            <Link
              href={url({ view, month, week: shiftWeek(week, -1) })}
              aria-label="Previous week"
              className="border-line-strong bg-surface flex size-11 items-center justify-center rounded-md border"
            >
              <ChevronLeft className="size-5" strokeWidth={1.75} aria-hidden />
            </Link>
            <span className="min-w-[130px] text-center text-lg font-semibold">
              {weekLabel(week)}
            </span>
            <Link
              href={url({ view, month, week: shiftWeek(week, 1) })}
              aria-label="Next week"
              className="border-line-strong bg-surface flex size-11 items-center justify-center rounded-md border"
            >
              <ChevronRight className="size-5" strokeWidth={1.75} aria-hidden />
            </Link>
            <Link
              href={url({ view, month, week: weekStart(today) })}
              className="hover:text-ink text-ink-2 flex min-h-11 items-center px-3.5 text-sm font-medium"
            >
              This week
            </Link>
            {weekPosts.length ? (
              <span className="meta">{weekSummary(weekPosts)}</span>
            ) : (
              <StateLabel state="off">Nothing planned yet</StateLabel>
            )}
          </div>
        )}
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
          <Link
            href={url({ view: "week", month, week })}
            data-active={view === "week" || undefined}
          >
            Week
          </Link>
          <Link href={url({ view: "month", month })} data-active={view === "month" || undefined}>
            Month
          </Link>
          <Link href={url({ view: "list", month })} data-active={view === "list" || undefined}>
            List
          </Link>
        </nav>
        <Link
          href={url({ view, month, week, compose: true })}
          scroll={false}
          className={buttonVariants({ variant: "primary" })}
        >
          + New post
        </Link>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex min-w-0 flex-col gap-3">
          <p className="meta">{zoneLine(timeZone)}</p>
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
              <span className="min-w-[200px] flex-1">
                <strong className="font-semibold">
                  {attention.length === 1
                    ? "1 post needs a new time."
                    : `${attention.length} posts need a new time.`}
                </strong>{" "}
                &ldquo;{first.content.slice(0, 40)}
                {first.content.length > 40 ? "…" : ""}&rdquo; didn&apos;t go out.
              </span>
              <Link
                href={url({
                  view,
                  month: parseMonth(postDay(first, timeZone).slice(0, 7)),
                  post: first.id,
                })}
                className="text-ink border-line-strong bg-surface flex min-h-11 items-center rounded-md border px-4 font-medium"
              >
                Pick a new time
              </Link>
            </div>
          )}

          {view === "list" ? (
            <PostsTable
              posts={posts}
              platforms={platformOfAccount}
              reach={reach}
              openHref={(id) => url({ view, month, post: id })}
              timeZone={timeZone}
            />
          ) : view === "week" ? (
            <div className="grid gap-3 md:grid-cols-7" aria-label={`Week of ${weekLabel(week)}`}>
              {days.map((d) => {
                const list = byDay.get(d) ?? [];
                const date = new Date(`${d}T12:00`);
                return (
                  <section
                    key={d}
                    aria-current={d === today ? "date" : undefined}
                    className={cn(
                      "card flex min-h-[180px] min-w-0 flex-col gap-2 p-2.5",
                      d === day && "ring-honey ring-1",
                    )}
                  >
                    <p className="flex items-baseline gap-1.5 text-[13px]">
                      <span className="text-ink-3">
                        {date.toLocaleDateString(undefined, { weekday: "short" })}
                      </span>
                      <span
                        className={cn(
                          "font-semibold",
                          d === today &&
                            "bg-honey text-ink inline-flex min-w-[22px] justify-center rounded-full px-1",
                        )}
                      >
                        {date.getDate()}
                      </span>
                    </p>
                    {list.map((p) => {
                      const word = postStatusWord(p);
                      const at = p.published_at ?? p.scheduled_for;
                      return (
                        <Link
                          key={p.id}
                          href={url({ view, month, week, post: p.id })}
                          aria-current={p.id === postId ? "true" : undefined}
                          className={cn(
                            "text-ink flex flex-col gap-0.5 rounded-lg border px-2 py-1.5 text-xs no-underline",
                            word === "Needs you"
                              ? "border-honey-border bg-honey-tint"
                              : word === "Posted"
                                ? "bg-subtle border-transparent"
                                : "border-line-strong bg-surface",
                            p.id === postId && "outline-ink outline-2",
                          )}
                        >
                          <span className="line-clamp-2 font-medium">
                            {p.content.split("\n")[0] || "Photo"}
                          </span>
                          <span className="text-ink-3">
                            {word}
                            {at && word !== "Needs you" ? ` · ${clockIn(at, timeZone)}` : ""}
                          </span>
                        </Link>
                      );
                    })}
                    {list.length === 0 ? (
                      // Rule 4 (option B): an empty day is one empty cell that fills on hover.
                      <Link
                        href={url({ view, month, week, day: d })}
                        aria-label={`Plan a post for ${date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}`}
                        className="empty-slot"
                      >
                        <EmptyCell size={36} />
                        <span className="empty-slot-text">Plan a post</span>
                      </Link>
                    ) : (
                      <Link
                        href={url({ view, month, week, day: d })}
                        aria-label={`Plan another post for ${date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}`}
                        className="empty-slot mt-auto flex-none flex-row py-1.5"
                      >
                        <EmptyCell size={18} />
                        <span className="empty-slot-text">Plan</span>
                      </Link>
                    )}
                  </section>
                );
              })}
            </div>
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
                              timeZone={timeZone}
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

        {selectedPost ? (
          <SidePanel label="This post" closeHref={url({ view, month, week })}>
            <Post
              post={selectedPost}
              accounts={names}
              targets={accounts}
              timeZone={timeZone}
              as="div"
            />
          </SidePanel>
        ) : day || composing ? (
          <SidePanel
            label={
              day
                ? `New post · ${new Date(`${day}T12:00`).toLocaleDateString(undefined, {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}`
                : "New post"
            }
            closeHref={url({ view, month, week })}
          >
            <ComposeCard day={day} time={time} bare />
          </SidePanel>
        ) : null}
      </div>
    </>
  );
}
