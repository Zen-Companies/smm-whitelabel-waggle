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
import { loadBestTimes } from "@/features/analytics";
import { createServerSupabase } from "@/lib/supabase/server";
import { bestChips } from "./best-chips";
import { ComposeCard } from "./compose-card";
import { StateLabel } from "@/components/app/state-mark";
import { PostsHeader } from "./posts-header";
import { platformLabel, platformOf } from "@/lib/social/platforms";
import { canMove } from "./move";
import {
  accountNames,
  loadMetrics,
  loadPosts,
  loadRepeats,
  Post,
  PostsTable,
  type PostRow,
} from "./posts-list";
import { repeatInfo, repeatLabel, ruleOfRow } from "./repeat-rule";
import { parseListSort, type ListSort } from "./list-sort";
import { BestPostCard } from "./best-post-card";
import { bestPostThisWeek, postResults } from "./post-metrics";
import { clockIn, dateTimeIn, dayKeyIn, fromWallClock, zoneLine } from "./post-time";
import { startFrom, type StartRow } from "./start-from";
import { WeekBoard } from "./week-board";

// Posts (design "5 · Posts", T74a): the week by default (each day a column with its posts and
// "+ Plan a post"), a month calendar, or the list with people reached. New post, Edit post and
// Duplicate open the big window (Posts Round 3).

type View = "week" | "month" | "list";

function url(p: {
  view: View;
  /** Round 5: the List view's sort. */
  sort?: ListSort;
  month: Month;
  week?: string;
  day?: string;
  post?: string;
  /** The composer, open with no day picked. */
  compose?: boolean;
  /** Round 3: Edit post / Duplicate on this post. */
  edit?: string;
  duplicate?: string;
  /** Round 3: the calendar shows only posts going to this platform. */
  platform?: string | null;
}) {
  const q = new URLSearchParams();
  if (p.view !== "week") q.set("view", p.view);
  if (p.view === "week" && p.week) q.set("week", p.week);
  else q.set("month", monthParam(p.month));
  if (p.platform) q.set("platform", p.platform);
  if (p.view === "list" && p.sort && p.sort !== "newest") q.set("sort", p.sort);
  if (p.day) q.set("day", p.day);
  if (p.post) q.set("post", p.post);
  if (p.compose) q.set("new", "1");
  if (p.edit) q.set("edit", p.edit);
  if (p.duplicate) q.set("duplicate", p.duplicate);
  return `/posts?${q}`;
}

/** A post to edit or copy, this brand's only (read through RLS). */
async function loadStartRow(tenantId: string, postId: string) {
  const supabase = await createServerSupabase();
  const { data } = await supabase
    .from("posts")
    .select(
      "id, content, media, target_account_ids, platform_options, scheduled_for, status, zernio_post_id, repeat_id",
    )
    .eq("tenant_id", tenantId)
    .eq("id", postId)
    .maybeSingle();
  return data as
    (StartRow & { status: string; zernio_post_id: string | null; repeat_id: string | null }) | null;
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
  const repeats = !!post.repeat_id;
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
        {repeats && (
          <span className="text-honey-text" aria-label="Repeats: ">
            ↻{" "}
          </span>
        )}
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
  const sort = parseListSort(str("sort"));
  const day = parseDay(str("day"));
  const today = dayKeyIn(new Date(), timeZone);
  const week = weekStart(parseDay(str("week")) ?? day ?? today);
  const month =
    view === "week" ? parseMonth(week.slice(0, 7)) : parseMonth(str("month") ?? today.slice(0, 7));
  const time = day ? parseTime(str("time")) : null;
  const postId = str("post");
  const composing = str("new") === "1";
  const editId = str("edit");
  const duplicateId = str("duplicate");
  const done = str("done") === "edited" ? "edited" : str("done") === "copied" ? "copied" : null;
  const names = accountNames(accounts);
  // Round 3: filter by platform, only when the brand posts to 2 or more.
  const accountPlatform = new Map(accounts.map((a) => [a.id, a.platform]));
  const brandPlatforms = [
    ...new Set(accounts.filter((a) => platformOf(a.platform)?.post).map((a) => a.platform)),
  ];
  const platform =
    brandPlatforms.length > 1 && brandPlatforms.includes(str("platform") ?? "")
      ? (str("platform") as string)
      : null;
  const u = (p: Omit<Parameters<typeof url>[0], "platform">) => url({ ...p, platform });
  const shown = platform
    ? posts.filter((p) => p.target_account_ids.some((id) => accountPlatform.get(id) === platform))
    : posts;
  const selectedPost = postId ? posts.find((p) => p.id === postId) : undefined;
  const attention = shown.filter(needsNewTime);
  const byDay = new Map<string, PostRow[]>();
  for (const p of shown) {
    if (p.status === "cancelled" && !p.failure_reason) continue;
    const key = postDay(p, timeZone);
    byDay.set(key, [...(byDay.get(key) ?? []), p]);
  }
  // Days that already have a post, for the picker's dots (every platform).
  const busyDays = [
    ...new Set(
      posts
        .filter((p) => p.status !== "cancelled" && (p.scheduled_for || p.published_at))
        .map((p) => postDay(p, timeZone)),
    ),
  ];
  // Round 3: Edit and Duplicate start from a saved post; best times for the picker's chips.
  const startRow = editId
    ? await loadStartRow(tenant.id, editId)
    : duplicateId
      ? await loadStartRow(tenant.id, duplicateId)
      : null;
  const editable = editId && startRow && canMove(startRow) ? startRow : null;
  const copying = duplicateId && startRow ? startRow : null;
  const needsPicker = !!(selectedPost || composing || day || editable || copying);
  const chips = needsPicker
    ? bestChips(await loadBestTimes(await createServerSupabase(), tenant.id), new Date(), timeZone)
    : null;
  const picker = { timeZone, chips, busyDays };
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
  // Round 4: each sent post's numbers from the hourly copy (no platform calls on page open).
  const [metrics, repeats] = await Promise.all([
    loadMetrics(tenant.id, posts),
    loadRepeats(tenant.id, editable ? [...posts, editable] : posts),
  ]);
  const repeatOf = (p: { id: string; repeat_id?: string | null }) => {
    const row = p.repeat_id ? repeats.get(p.repeat_id) : undefined;
    return row ? repeatInfo(row, p.id, timeZone) : null;
  };
  const editRepeat = editable?.repeat_id ? repeats.get(editable.repeat_id) : undefined;
  const now = new Date();
  const resultsOf = (p: PostRow) =>
    p.zernio_post_id
      ? postResults(
          p.target_account_ids.flatMap((id) => accountPlatform.get(id) ?? []),
          metrics.get(p.zernio_post_id) ?? [],
        )
      : null;
  const best = bestPostThisWeek(
    posts.flatMap((p) => {
      const results = p.status === "published" && p.published_at ? resultsOf(p) : null;
      return results && p.published_at
        ? [{ postId: p.id, publishedAt: p.published_at, results }]
        : [];
    }),
    fromWallClock(weekStart(today), "00:00", timeZone).toISOString(),
    now,
  );
  const bestRow = best ? posts.find((p) => p.id === best.postId) : undefined;

  return (
    <>
      <PostsHeader />
      {best && bestRow && (
        <BestPostCard
          best={best}
          title={bestRow.content.split("\n")[0] || "Photo"}
          href={u({ view, month, week, post: bestRow.id })}
        />
      )}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {view === "week" && (
          <div className="flex flex-wrap items-center gap-1">
            <Link
              href={u({ view, month, week: shiftWeek(week, -1) })}
              aria-label="Previous week"
              className="border-line-strong bg-surface flex size-11 items-center justify-center rounded-md border"
            >
              <ChevronLeft className="size-5" strokeWidth={1.75} aria-hidden />
            </Link>
            <span className="min-w-[130px] text-center text-lg font-semibold">
              {weekLabel(week)}
            </span>
            <Link
              href={u({ view, month, week: shiftWeek(week, 1) })}
              aria-label="Next week"
              className="border-line-strong bg-surface flex size-11 items-center justify-center rounded-md border"
            >
              <ChevronRight className="size-5" strokeWidth={1.75} aria-hidden />
            </Link>
            <Link
              href={u({ view, month, week: weekStart(today) })}
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
              href={u({ view, month: shiftMonth(month, -1) })}
              aria-label="Previous month"
              className="border-line-strong bg-surface flex size-11 items-center justify-center rounded-md border"
            >
              <ChevronLeft className="size-5" strokeWidth={1.75} aria-hidden />
            </Link>
            <span className="min-w-[150px] text-center text-lg font-semibold">{monthName}</span>
            <Link
              href={u({ view, month: shiftMonth(month, 1) })}
              aria-label="Next month"
              className="border-line-strong bg-surface flex size-11 items-center justify-center rounded-md border"
            >
              <ChevronRight className="size-5" strokeWidth={1.75} aria-hidden />
            </Link>
            <Link
              href={u({ view, month: thisMonth })}
              className="hover:text-ink text-ink-2 flex min-h-11 items-center px-3.5 text-sm font-medium"
            >
              Today
            </Link>
          </div>
        )}
        <nav aria-label="View" className="segmented ml-auto">
          <Link href={u({ view: "week", month, week })} data-active={view === "week" || undefined}>
            Week
          </Link>
          <Link href={u({ view: "month", month })} data-active={view === "month" || undefined}>
            Month
          </Link>
          <Link href={u({ view: "list", month })} data-active={view === "list" || undefined}>
            List
          </Link>
        </nav>
        <Link
          href={u({ view, month, week, compose: true })}
          scroll={false}
          className={buttonVariants({ variant: "primary" })}
        >
          + New post
        </Link>
      </div>

      <div className="flex flex-col gap-6">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {brandPlatforms.length > 1 && (
              <nav aria-label="Show posts for" className="flex flex-wrap gap-1.5">
                {[null, ...brandPlatforms].map((p) => (
                  <Link
                    key={p ?? "all"}
                    href={url({ view, month, week, platform: p })}
                    scroll={false}
                    aria-current={platform === p ? "true" : undefined}
                    className={cn(
                      "inline-flex min-h-9 items-center rounded-full border px-3 text-[13px] font-semibold",
                      platform === p
                        ? "bg-ink text-surface border-ink"
                        : "border-line-strong bg-surface text-ink-2 hover:bg-subtle",
                    )}
                  >
                    {p ? platformLabel(p) : "All"}
                  </Link>
                ))}
              </nav>
            )}
            <p className="meta">{zoneLine(timeZone)}</p>
          </div>
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
                href={u({
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
              results={resultsOf}
              openHref={(id) => u({ view, month, post: id, sort })}
              timeZone={timeZone}
              sort={sort}
              sortHrefs={{
                newest: u({ view, month }),
                reached: u({ view, month, sort: "reached" }),
                engagement: u({ view, month, sort: "engagement" }),
              }}
            />
          ) : view === "week" ? (
            <WeekBoard
              label={`Week of ${weekLabel(week)}`}
              timeZone={timeZone}
              days={days.map((d) => {
                const date = new Date(`${d}T12:00`);
                return {
                  key: d,
                  weekday: date.toLocaleDateString("en-US", { weekday: "short" }),
                  dayNum: date.getDate(),
                  long: date.toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  }),
                  isToday: d === today,
                  isPlanDay: d === day,
                  planHref: u({ view, month, week, day: d }),
                };
              })}
              posts={days.flatMap((d) =>
                (byDay.get(d) ?? []).map((p) => ({
                  id: p.id,
                  day: d,
                  href: u({ view, month, week, post: p.id }),
                  firstLine: p.content.split("\n")[0] || "Photo",
                  word: postStatusWord(p),
                  at: p.published_at ?? p.scheduled_for,
                  selected: p.id === postId,
                  movable: canMove(p) && !!p.scheduled_for,
                  scheduledFor: p.scheduled_for,
                  repeats: !!p.repeat_id,
                })),
              )}
            />
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
                            href={u({ view, month, day: d })}
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
                              href={u({ view, month, post: p.id })}
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

        {editable ? (
          <ComposeCard
            mode="edit"
            initial={{
              ...startFrom(editable, "edit", timeZone),
              // Round 5: a live repeat asks how far the edit goes.
              repeat:
                editRepeat && !editRepeat.stopped_at && !editRepeat.finished_at
                  ? { label: repeatLabel(ruleOfRow(editRepeat)) }
                  : null,
            }}
            title="Edit post"
            subtitle={
              editable.scheduled_for
                ? `Planned for ${dateTimeIn(editable.scheduled_for, timeZone)}`
                : undefined
            }
            closeHref={u({ view, month, week, post: editable.id })}
            doneHref={u({ view, month, week })}
            timeZone={timeZone}
            chips={chips}
            busyDays={busyDays}
          />
        ) : copying ? (
          <ComposeCard
            mode="duplicate"
            initial={startFrom(copying, "duplicate", timeZone)}
            title="New post"
            subtitle="A copy · pick when it goes out"
            closeHref={u({ view, month, week, post: copying.id })}
            doneHref={u({ view, month, week })}
            timeZone={timeZone}
            chips={chips}
            busyDays={busyDays}
          />
        ) : selectedPost ? (
          <SidePanel label="This post" closeHref={u({ view, month, week })}>
            <Post
              post={selectedPost}
              accounts={names}
              targets={accounts}
              timeZone={timeZone}
              as="div"
              picker={picker}
              editHref={u({ view, month, week, edit: selectedPost.id })}
              duplicateHref={u({ view, month, week, duplicate: selectedPost.id })}
              done={done}
              results={resultsOf(selectedPost)}
              repeat={repeatOf(selectedPost)}
              now={now}
            />
          </SidePanel>
        ) : day || composing ? (
          <ComposeCard
            day={day}
            time={time}
            title="New post"
            subtitle={
              day
                ? `For ${new Date(`${day}T12:00`).toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}`
                : undefined
            }
            closeHref={u({ view, month, week })}
            doneHref={u({ view, month, week })}
            timeZone={timeZone}
            chips={chips}
            busyDays={busyDays}
          />
        ) : null}
      </div>
    </>
  );
}
