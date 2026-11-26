import { viewerTimeZone } from "@/lib/time/viewer-zone";

import { DraftOnOpenCard } from "./draft-on-open-card";
import { CircleCheck, Clock3, Mail, X } from "lucide-react";

import Link from "next/link";

import { Fragment, Suspense } from "react";

import { ActionLink } from "@/components/app/action-link";

import { Avatar } from "@/components/app/avatar";

import { inboxHref } from "@/lib/routes";

import { EmptySpot } from "@/components/app/empty-spot";

import { StateLabel } from "@/components/app/state-mark";

import { clockTime, shortTime } from "@/components/app/time";

import { NotConnectedYet } from "@/features/accounts";

import { MarkItemRead } from "@/features/alerts";

import { can } from "@/features/orgs";

import { getCurrentTenant, RoleGate } from "@/features/tenants";

import { loadTenantAiSpend } from "@/lib/llm/spend";

import { createServerSupabase } from "@/lib/supabase/server";

import { getSocialProvider } from "@/lib/social";

import { getServiceClient } from "@/lib/supabase/service";

import { cn } from "cn";

import { allowanceNotice } from "./allowance-notice";

import { messageWords } from "./attachments";

import { CaughtUpCard } from "./caught-up-card";

import { ApprovalCard, RecentSends } from "./approval-card";

import { SendingProgress } from "./sending-progress";

import { loadConversation } from "./conversation-data";

import { ContextPanel, ConversationPane } from "./conversation-pane";

import { HeldCard } from "./held-card";

import { SpamCard, SpamCommentFooter } from "./spam-card";

import { loadTemplateChoices, whatsappWindowClosed } from "./whatsapp-window";

import { WhatsAppWindowCard } from "./whatsapp-window-card";

import { CallCard } from "./call-card";

import {
  answeredBy,
  ANSWERED_FILTERS,
  countAutomatedSenders,
  countInboxTabs,
  heldReason,
  normalizeAnsweredBy,
  INBOX_TABS,
  loadEntries,
  loadInboxConversations,
  loadNextPost,
  loadTodayActivity,
  loadTodaySummary,
  searchInbox,
  searchPattern,
  tabOf,
  todayLine,
  needsOwner,
  type InboxConversation,
  type InboxEntry,
  type InboxTab,
  type NextPost,
  type TodaySummary,
} from "./inbox-data";

import {
  activeFilterCount,
  CLOSING_SOON_MS,
  filterParams,
  GROUP_LABELS,
  INBOX_FLAGS,
  INBOX_TYPES,
  inboxType,
  parseInboxFilters,
  rowCountLabel,
  toggleFilter,
  windowLeft,
} from "./inbox-groups";

import { InboxFiltersButton, InboxSortBar } from "./inbox-filters";

import { MarkConversationSeen, MoveSenderButton } from "./inbox-row-client";

import { isEmailPlatform } from "@/features/inbox";

import { InboxLive } from "./inbox-live";

import { InboxSearch } from "./inbox-search";

import { rowNote, rowState } from "./row-note";

import { highlightParts } from "./search-highlight";

import { inboxRules, platformLabel } from "@/lib/social/platforms";

import { AddBooking, calendarAccount } from "@/features/calendar";

// Inbox (Inbox polish, approved 16 Nov): a headline ("4 things need you"), then two cards that

// fill the screen on desktop: the list (search and tabs pinned on top, rows scroll under them) and

// the conversation with the customer beside it. List → conversation on phones. Rows: a honey dot

// when the owner must act, three lines, the channel's logo in colour and a honeycomb state.

// Each tab is a place (/inbox, /inbox/answered, /inbox/hidden); the open message and filters

// stay as query (routes, 16 Nov).


/** Inbox by sender (26 Nov): what a row knows beyond its latest message. */
type RowMeta = Pick<
  InboxConversation,
  "newMessages" | "threads" | "posts" | "messages" | "latestAt" | "automated"
>;

/** One list row (design.md §1 rules 2 and 4): who · what they said · what happens next. */

function Row({
  entry,

  meta,

  link,

  selected,

  q,

  now,

  action,
}: {
  entry: InboxEntry & { status: string };

  /** A row by sender (not while searching). */
  meta?: RowMeta;

  link: string;

  selected: boolean;

  /** While searching: the words to highlight, and the row says which tab it's in. */

  q?: string;

  now: Date;

  /** Updates & newsletters: "Move to For you" under the row. */
  action?: React.ReactNode;
}) {
  const needs = needsOwner(entry.status) && !meta?.automated;

  const note = meta?.automated
    ? { tone: "none" as const, label: undefined, text: "Automated sender" }
    : rowNote(entry);

  const words = messageWords(entry.text, entry.attachments ?? []);

  const inTab = q ? INBOX_TABS.find((t) => t.key === tabOf(entry.status))?.label : undefined;

  const email = isEmailPlatform(entry.platform);

  const count = meta
    ? meta.automated
      ? meta.threads > 1
        ? `${meta.threads} threads`
        : null
      : rowCountLabel({ ...meta, kind: entry.kind, email })
    : null;

  // The DM window (honey when under 3 hours), while the owner can still answer.
  const left = needs ? windowLeft(entry.dmWindowClosesAt, now) : null;

  const closingSoon =
    !!entry.dmWindowClosesAt && Date.parse(entry.dmWindowClosesAt) - now.getTime() <= CLOSING_SOON_MS;

  const at = meta?.latestAt ?? entry.receivedAt;

  return (
    <li className="flex flex-col">
      <Link
        href={link}

        aria-current={selected ? "true" : undefined}

        className={cn(
          "flex gap-3 rounded-[14px] px-3 py-3 no-underline transition-colors duration-150",

          selected ? "bg-honey-tint ring-honey-border ring-1 ring-inset" : "hover:bg-subtle/70",
        )}
      >
        <Avatar
          size={36}

          platform={entry.platform}

          icon={entry.kind === "review" ? "review" : entry.kind === "call" ? "call" : "person"}
        />

        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5">
            {needs && (
              <span className="bg-honey size-1.5 shrink-0 rounded-full" aria-label="Needs you" />
            )}

            <span className={cn("truncate", needs ? "font-semibold" : "text-ink-2")}>
              {entry.authorName ?? "A customer"}
            </span>

            {count && (
              <span
                className={cn(
                  "shrink-0 rounded-full px-1.5 text-xs font-semibold",

                  meta && meta.newMessages > 0 && !meta.automated
                    ? "bg-honey-tint text-honey-text"
                    : "bg-subtle text-ink-2",
                )}
              >
                {count}
              </span>
            )}

            <time
              className="text-ink-3 ml-auto shrink-0 text-[13px] tabular-nums"

              dateTime={at}
            >
              {shortTime(at)}
            </time>

            {inTab && (
              <span className="bg-subtle text-ink-2 shrink-0 rounded-md px-1.5 text-xs font-semibold">
                {inTab}
              </span>
            )}
          </span>

          {entry.subject && (
            <span className="truncate text-[14px] font-medium">{entry.subject}</span>
          )}

          <span className={cn("truncate", needs ? "text-ink-2" : "text-ink-3")}>
            {q
              ? highlightParts(words, q).map((part, i) =>
                  part.hit ? (
                    <mark key={i} className="bg-honey/45 text-ink rounded-sm font-semibold">
                      {part.text}
                    </mark>
                  ) : (
                    part.text
                  ),
                )
              : words}
          </span>

          <span className="mt-0.5 flex min-w-0 items-center gap-2">
            <StateLabel
              state={meta?.automated ? "off" : rowState(entry.status, note.tone)}

              className="min-w-0 text-[13px] whitespace-normal"
            >
              {note.label ? `${note.label} · ${note.text}` : note.text}
            </StateLabel>

            {left && (
              <span
                className={cn(
                  "ml-auto shrink-0 text-[13px] tabular-nums",

                  closingSoon ? "text-honey-text font-semibold" : "text-ink-3",
                )}
              >
                {left}
              </span>
            )}
          </span>
        </span>
      </Link>

      {action && <div className="px-3 pb-2 pl-[60px]">{action}</div>}
    </li>
  );
}

/** Updates & newsletters, one row at the foot of For you (board section 4). */

function UpdatesRow({ count, link }: { count: number; link: string }) {
  return (
    <li>
      <Link
        href={link}

        className="hover:bg-subtle/70 border-line mt-1 flex gap-3 rounded-[14px] border-t px-3 py-3 no-underline"
      >
        <span className="bg-subtle text-ink-2 grid size-9 shrink-0 place-items-center rounded-full">
          <Mail className="size-4" strokeWidth={1.75} aria-hidden />
        </span>

        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-ink-2 font-semibold">Updates &amp; newsletters</span>

          <span className="text-ink-3 text-[13px]">
            {count === 1 ? "1 sender" : `${count} senders`} · Waggle doesn&apos;t answer these
          </span>
        </span>
      </Link>
    </li>
  );
}

/** The headline (design.md §4): what needs the owner, and one gray line about today. */

function InboxHeadline({ today }: { today: TodaySummary }) {
  const n = today.forYou;

  return (
    <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
      <h1 className="page-title">
        {n === 0 ? "Nothing needs you" : n === 1 ? "1 thing needs you" : `${n} things need you`}
      </h1>

      <p className="text-ink-3">{todayLine(today)}</p>
    </div>
  );
}

/** Next post, at the foot of the list (design.md §4): plain text, no card. */

function NextPostNote({ post }: { post: NextPost }) {
  const when = new Date(post.scheduledFor).toLocaleString(undefined, {
    weekday: "short",

    hour: "numeric",

    minute: "2-digit",
  });

  return (
    <Link
      href="/posts"

      className="border-line hover:bg-subtle -mx-2 mt-2 flex flex-col gap-0.5 rounded-lg border-t px-2 pt-4 pb-2 text-[13px] no-underline"
    >
      <span className="label">Next post</span>

      <span className="text-ink text-sm">{post.title}</span>

      <span className="text-ink-2">
        {when} · {post.platforms === 1 ? "1 account" : `${post.platforms} accounts`}
      </span>
    </Link>
  );
}

/** T41: a comment answered in DM (design v3 "Reply in DM"): sent, or checking after a retry. */

function DmReplyFooter({ entry }: { entry: InboxEntry & { status: string } }) {
  const platform = platformLabel(entry.platform);

  if (entry.status === "sending" && entry.attempts > 0) {
    return (
      <p
        role="status"

        className="border-line flex items-center gap-2.5 rounded-xl border px-4 py-3.5"
      >
        <Clock3 className="text-honey-text size-4 shrink-0" strokeWidth={2} aria-hidden />
        Checking with {platform} whether it went through. Waggle won&apos;t send it again until it
        knows.
      </p>
    );
  }

  if (entry.status !== "sent") return <SentFooter entry={entry} />;

  return (
    <p
      role="status"

      className="border-line flex flex-wrap items-center gap-2.5 rounded-xl border px-4 py-3.5"
    >
      <CircleCheck className="text-success size-4 shrink-0" strokeWidth={2} aria-hidden />
      Sent to {entry.authorName ?? "them"} in DM. Their answer will show up here as a message.
      <a
        href={
          entry.platform === "facebook"
            ? "https://www.facebook.com/messages/"
            : "https://www.instagram.com/direct/inbox/"
        }

        target="_blank"

        rel="noopener noreferrer"

        className="ml-auto font-medium whitespace-nowrap"
      >
        Open the DM
      </a>
    </p>
  );
}

/** T42: a review's reply went up on the Page (design v3 "Facebook Page reviews"). */

function ReviewReplyFooter({ entry }: { entry: InboxEntry & { status: string } }) {
  if (entry.status !== "sent") return <SentFooter entry={entry} />;

  const platform = platformLabel(entry.platform);

  const who = entry.authorName ? `${entry.authorName}'s` : "the";

  return (
    <p
      role="status"

      className="border-line flex flex-wrap items-center gap-2.5 rounded-xl border px-4 py-3.5"
    >
      <CircleCheck className="text-success size-4 shrink-0" strokeWidth={2} aria-hidden />
      Your reply is on {platform} under {who} review.
      {entry.permalink && (
        <a
          href={entry.permalink}

          target="_blank"

          rel="noopener noreferrer"

          className="ml-auto font-medium whitespace-nowrap"
        >
          See it on {platform}
        </a>
      )}
    </p>
  );
}

/** The footer of an answered or ignored item: what happened, in one line. */

function SentFooter({ entry }: { entry: InboxEntry & { status: string } }) {
  const done: Record<string, string> = {
    handled: "Marked as handled",

    ignored: "Ignored: it looked like spam",

    rejected: "You chose not to reply",
  };

  return (
    <p className="bg-subtle inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm">
      {entry.status !== "sending" ? (
        <>
          <CircleCheck
            className={
              entry.status === "sent" || entry.answeredOnPlatformAt ? "text-success" : "text-ink-3"
            }

            strokeWidth={1.75}

            aria-hidden
          />

          {entry.status === "handled" && entry.answeredOnPlatformAt
            ? `You replied on ${platformLabel(entry.platform)} yourself, so Waggle's draft wasn't sent.`
            : (done[entry.status] ??
              `${entry.draft && !entry.draft.decidedByOwner ? "Answered on its own" : "Answered"}${
                entry.draft?.sentAt ? ` · ${clockTime(entry.draft.sentAt)}` : ""
              }`)}
        </>
      ) : (
        <>
          <Clock3 strokeWidth={1.75} aria-hidden />
          Sending now
        </>
      )}
    </p>
  );
}

export async function InboxView({
  tab = "for_you",

  searchParams,

  notice,
}: {
  /** From the path: /inbox, /inbox/answered or /inbox/hidden. */

  tab?: InboxTab;

  /** For you: one line above the list (the DM countdown, Playbook round 2). */
  notice?: React.ReactNode;

  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  // Old links (?tab=waiting / needs / sent) are forwarded to the tab's path by the proxy.

  const itemParam = typeof params.item === "string" ? params.item : undefined;

  // Search (Inbox polish, approved 16 Nov): names and words across all three tabs.

  const q = typeof params.q === "string" ? params.q.slice(0, 80) : "";

  const pattern = searchPattern(q);

  // Inbox by sender (26 Nov): filters and sort live in the address; Updates & newsletters is a
  // view of For you (?view=updates).

  const filters = parseInboxFilters(params);

  const updatesView = tab === "for_you" && params.view === "updates";

  // Answered tab (T27, T72): all, or by who answered.

  const by =
    tab === "answered"
      ? normalizeAnsweredBy(typeof params.by === "string" ? params.by : undefined)
      : "all";

  const tenant = await getCurrentTenant();

  const supabase = await createServerSupabase();

  const timeZone = await viewerTimeZone();

  const now = new Date();

  const [
    rows,
    counts,
    updatesCount,
    { data: accountRows },
    { data: settings },
    spend,
    today,
    nextPost,
  ] = await Promise.all([
    loadInboxConversations(supabase, tenant.id, {
      tab,
      filters,
      automated: updatesView,
      now,
    }),

    countInboxTabs(supabase, tenant.id, filters.customersOnly),

    tab === "for_you" && filters.customersOnly
      ? countAutomatedSenders(supabase, tenant.id)
      : Promise.resolve(0),

    supabase.from("social_accounts").select("platform").eq("tenant_id", tenant.id),

    supabase.from("tenants").select("replies_paused").eq("id", tenant.id).single(),

    // T32: this month's AI allowance (service role: spend is summed across ai_usage).

    loadTenantAiSpend(getServiceClient(), tenant.id, now),

    loadTodaySummary(supabase, tenant.id, now, timeZone),

    loadNextPost(supabase, tenant.id),
  ]);

  const accounts = accountRows?.length ?? 0;

  const platforms = [...new Set((accountRows ?? []).map((a) => a.platform))]
    .sort()
    .map((p) => ({ key: p, label: platformLabel(p) }));

  const allowance = allowanceNotice(spend);

  // Search finds messages, not rows; the filters narrow it.

  const found = pattern
    ? (await searchInbox(supabase, tenant.id, pattern)).filter(
        (e) =>
          (filters.platforms.length === 0 || filters.platforms.includes(e.platform)) &&
          (filters.types.length === 0 ||
            filters.types.includes(
              inboxType(e.kind, isEmailPlatform(e.platform)) as (typeof filters.types)[number],
            )),
      )
    : null;

  const tabRows: InboxConversation[] =
    by === "all" ? rows : rows.filter((e) => answeredBy(e) === by);

  const entries: (InboxEntry & { status: string })[] = found ?? tabRows;

  const metaOf = new Map(found ? [] : tabRows.map((r) => [r.itemId, r]));

  const listQuery = filterParams(filters);

  const path = inboxHref(tab);

  const link = (item?: string) =>
    found
      ? `/inbox?q=${encodeURIComponent(q)}${item ? `&item=${item}` : ""}`
      : inboxHref(tab, {
          ...listQuery,
          by: by !== "all" ? by : undefined,
          view: updatesView ? "updates" : undefined,
          item,
        });

  const byCounts = new Map<string, number>([["all", rows.length]]);

  for (const e of rows) {
    const who = answeredBy(e);

    if (who) byCounts.set(who, (byCounts.get(who) ?? 0) + 1);
  }

  // The open message: a row, or (from a notification or an older link) any message of the brand.

  const listed = entries.find((e) => e.itemId === itemParam);

  const opened =
    itemParam && !listed && /^[0-9a-f-]{36}$/i.test(itemParam)
      ? ((await loadEntries(supabase, tenant.id, { itemIds: [itemParam] }))[0] ?? null)
      : null;

  const selected = listed ?? opened ?? entries[0];

  const selectedMeta = selected ? metaOf.get(selected.itemId) : undefined;

  const index = selected ? entries.indexOf(selected) : -1;

  const next = index >= 0 && index + 1 < entries.length ? entries[index + 1] : null;

  const held = selected && (selected.status === "escalated" || selected.status === "failed");

  const reason = held ? await heldReason(supabase, selected.itemId, selected.status) : null;

  // "3 new": when this person last opened the row (read before opening it marks it seen again).

  const seenAt = selectedMeta
    ? ((
        await supabase
          .from("inbox_reads")
          .select("seen_at")
          .eq("tenant_id", tenant.id)
          .eq("user_id", tenant.userId)
          .eq("group_key", selectedMeta.groupKey)
          .maybeSingle()
      ).data?.seen_at ?? null)
    : null;

  const filterCount = activeFilterCount(filters);

  // Tabs sit on top of the list (design.md §4): text with an ink underline, counts in gray.

  const tabs = (
    <div className="flex flex-col">
      <nav aria-label="Inbox filters" className="tabs">
        {INBOX_TABS.map((t) => (
          <Link
            key={t.key}
            href={inboxHref(t.key, listQuery)}
            data-active={t.key === tab || undefined}
          >
            {t.label}

            <span>{counts[t.key]}</span>
          </Link>
        ))}
      </nav>

      {tab === "answered" && (
        <nav aria-label="Answered filter" className="flex flex-wrap gap-x-4 pt-2 text-[13px]">
          {ANSWERED_FILTERS.map((f) => ({
            label: `${f.label} ${byCounts.get(f.key) ?? 0}`,

            href: inboxHref("answered", {
              ...listQuery,
              by: f.key !== "all" ? f.key : undefined,
            }),

            active: by === f.key,
          })).map((f) => (
            <Link
              key={f.label}

              href={f.href}

              aria-current={f.active ? "page" : undefined}

              className={cn(
                "flex min-h-9 items-center",

                f.active ? "text-ink font-semibold" : "hover:text-ink text-ink-2",
              )}
            >
              {f.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );

  // Filters and sort on one row under the tabs; applied filters as honey chips with ×.

  const applied: { key: string; label: string; href: string }[] = [
    ...filters.platforms.map((p) => ({
      key: `p-${p}`,
      label: platformLabel(p),
      href: inboxHref(tab, filterParams(toggleFilter(filters, "platforms", p))),
    })),
    ...filters.types.map((t) => ({
      key: `t-${t}`,
      label: INBOX_TYPES.find((x) => x.key === t)?.label ?? t,
      href: inboxHref(tab, filterParams(toggleFilter(filters, "types", t))),
    })),
    ...filters.flags.map((f) => ({
      key: `f-${f}`,
      label: INBOX_FLAGS.find((x) => x.key === f)?.label ?? f,
      href: inboxHref(tab, filterParams(toggleFilter(filters, "flags", f))),
    })),
    ...(filters.customersOnly
      ? []
      : [
          {
            key: "everyone",
            label: "Automated senders shown",
            href: inboxHref(tab, filterParams({ ...filters, customersOnly: true })),
          },
        ]),
  ];

  const filterBar = (
    <div className="relative flex flex-col gap-2 pb-3">
      <div className="flex flex-wrap items-center gap-2">
        <InboxFiltersButton
          path={path}
          filters={filters}
          platforms={platforms}
          showSort={tab === "for_you"}
        />

        {tab === "for_you" && <InboxSortBar path={path} filters={filters} />}
      </div>

      {applied.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {applied.map((a) => (
            <Link
              key={a.key}
              href={a.href}
              aria-label={`Remove ${a.label}`}
              className="bg-honey-tint border-honey-border text-ink inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold no-underline"
            >
              {a.label}
              <X className="size-3.5" aria-hidden />
            </Link>
          ))}

          <Link
            href={inboxHref(tab, filters.sort === "newest" ? { sort: "newest" } : undefined)}
            className="text-ink-2 hover:text-ink ml-1 text-xs font-semibold"
          >
            Clear all
          </Link>
        </div>
      )}
    </div>
  );

  const listCard = (body: React.ReactNode, hideOnPhone = false) => (
    <div
      className={cn(
        "card flex min-h-0 min-w-0 flex-col overflow-hidden",

        hideOnPhone && "hidden lg:flex",
      )}
    >
      <div className="border-line relative flex flex-col gap-2 border-b px-3.5 pt-3.5">
        <InboxSearch initial={q} />

        {found ? (
          <p className="text-ink-3 pt-1 pb-3 text-[13px]" role="status">
            {found.length === 0
              ? "Nothing found"
              : `${found.length === 1 ? "1 conversation" : `${found.length} conversations`} with “${q.trim()}”, across all tabs`}
          </p>
        ) : updatesView ? (
          <div className="flex flex-col gap-1 pb-3">
            <Link href={inboxHref("for_you", listQuery)} className="text-ink-2 text-sm">
              ← All conversations
            </Link>

            <p className="font-semibold">Updates &amp; newsletters</p>

            <p className="text-ink-3 text-[13px]">
              Emails from automated senders. They never count as things that need you and Waggle
              doesn&apos;t write replies to them.
            </p>
          </div>
        ) : (
          <>
            <div className="[&_.tabs]:border-b-0">{tabs}</div>

            {filterBar}
          </>
        )}
        {!found && !updatesView && tab === "for_you" && notice ? (
          <div className="has-[p]:pb-3">{notice}</div>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">{body}</div>
    </div>
  );

  // Nothing connected yet: one line into setup's Connect step (20 Nov).

  if (!accounts) {
    return (
      <>
        <h1 className="page-title">Inbox</h1>
        <NotConnectedYet brandName={tenant.name} canConnect={can(tenant.role, "accounts.manage")} />
      </>
    );
  }

  const empty = found ? (
    <EmptySpot className="px-2 py-6" action={<ActionLink href="/inbox">Clear search</ActionLink>}>
      <b className="text-ink font-semibold">No messages mention &ldquo;{q.trim()}&rdquo;</b>
      <br />
      Search looks at names, messages and Waggle&apos;s replies in all three tabs.
    </EmptySpot>
  ) : filterCount > 0 ? (
    <EmptySpot
      className="px-2 py-6"
      action={
        <ActionLink href={inboxHref(tab, filters.sort === "newest" ? { sort: "newest" } : undefined)}>
          Clear filters
        </ActionLink>
      }
    >
      Nothing here with these filters.
    </EmptySpot>
  ) : (
    <p className="meta px-2 py-6">
      {updatesView
        ? "No automated senders yet."
        : tab === "ignored"
          ? "Spam Waggle hid and messages that needed no reply show up here. Anything here can go back to For you."
          : by === "auto"
            ? "Nothing has gone out on its own yet."
            : by !== "all"
              ? "Nothing here yet."
              : "Replies that went out show up here."}
    </p>
  );

  // Nothing for the owner: the space a conversation would take shows what Waggle did today.

  const caughtUp =
    !found && !updatesView && tab === "for_you" && filterCount === 0 && entries.length === 0;

  const activity = caughtUp
    ? await loadTodayActivity(supabase, tenant.id, now, 5, timeZone)
    : [];

  const conversation = selected
    ? await loadConversation(supabase, tenant.id, selected.itemId)
    : null;

  // T67: a WhatsApp chat past its 24 hours can only be restarted with an approved template.

  const waWindow =
    selected && whatsappWindowClosed(selected)
      ? await loadTemplateChoices(supabase, getSocialProvider(), selected)
      : null;

  // One reply per conversation (26 Nov): how many of the sender's messages this reply answers.

  const answers =
    selected?.kind === "dm" && selectedMeta ? Math.max(1, selectedMeta.waiting) : 1;

  const actionFooter = !selected ? null : selected.kind === "call" ? (
    // T82b: a missed call or voicemail: listen, call back, mark handled. Never a reply.

    <CallCard key={selected.itemId} entry={selected} />
  ) : selected.status === "awaiting_draft" ? (
    <DraftOnOpenCard key={selected.itemId} itemId={selected.itemId} />
  ) : selected.status === "awaiting_approval" ? (
    <ApprovalCard
      key={selected.itemId}

      entry={selected}

      answers={answers}

      nextHref={next ? link(next.itemId) : null}
    />
  ) : held &&
    reason === "spam" &&
    selected.category === "spam" &&
    selected.kind === "comment" &&
    inboxRules(selected.platform).hide ? (
    // T40: a spam comment comes to the owner to hide; it's never answered.

    <SpamCard key={selected.itemId} entry={selected} />
  ) : waWindow ? (
    <WhatsAppWindowCard
      key={selected.itemId}

      entry={selected}

      templates={waWindow.templates}

      loadError={waWindow.loadError}
    />
  ) : held ? (
    <HeldCard key={selected.itemId} entry={selected} reason={reason} />
  ) : null;

  // T81d: a booking request, with a calendar connected: the owner adds it once confirmed.

  const bookingCalendar =
    selected?.category === "lead" && can(tenant.role, "replies.approve")
      ? await calendarAccount(getServiceClient(), tenant.id)
      : null;

  const booking =
    selected && bookingCalendar ? (
      <AddBooking
        key={`book-${selected.itemId}`}

        itemId={selected.itemId}

        defaultTitle={`${selected.authorName ?? "Customer"}: booking`}
      />
    ) : null;

  // T55: viewers read the conversation; the decision controls show disabled, with a note.

  const footer = !selected ? null : selectedMeta?.automated ? (
    <p className="bg-subtle inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm">
      From an automated sender. Waggle doesn&apos;t answer these.
    </p>
  ) : actionFooter ? (
    <RoleGate allowed={can(tenant.role, "replies.approve")} role={tenant.role} what="the replies">
      {actionFooter}
    </RoleGate>
  ) : selected.kind === "comment" &&
    inboxRules(selected.platform).hide &&
    (selected.hiddenOnPlatformAt ||
      (selected.category === "spam" &&
        (selected.status === "ignored" || selected.status === "handled"))) ? (
    <SpamCommentFooter key={selected.itemId} entry={selected} />
  ) : selected.kind === "review" ? (
    <ReviewReplyFooter entry={selected} />
  ) : selected.kind === "comment" && selected.draft?.replyVia === "dm" ? (
    <DmReplyFooter entry={selected} />
  ) : (
    <SentFooter entry={selected} />
  );

  // Needs you now → Ready to approve → Also for you, each with its count (For you, by priority).

  const grouped =
    !found && !updatesView && tab === "for_you" && filters.sort === "priority";

  const groupCounts = new Map<string, number>();

  for (const r of tabRows) groupCounts.set(r.group, (groupCounts.get(r.group) ?? 0) + 1);

  const canMove = can(tenant.role, "replies.approve");

  return (
    <div className="flex flex-col gap-5 lg:min-h-0 lg:flex-1">
      <InboxLive tenantId={tenant.id} />

      <InboxHeadline today={today} />

      {settings?.replies_paused && (
        <p role="status" className="banner">
          Replies are paused. Nothing is sent until you turn them back on in{" "}
          <Link href="/teach" className="link-inline">
            Teach Waggle
          </Link>
          .
        </p>
      )}

      {allowance && (
        <p role="status" className="banner">
          {allowance}
        </p>
      )}

      <Suspense fallback={null}>
        <SendingProgress tenantId={tenant.id} />
      </Suspense>

      <RecentSends />

      {caughtUp ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(300px,400px)_minmax(0,1fr)]">
          {listCard(
            <>
              <p className="meta px-2 py-4 text-[13px]">
                Nothing waiting. New messages show up here.
              </p>

              {updatesCount > 0 && (
                <ul className="flex flex-col">
                  <UpdatesRow
                    count={updatesCount}
                    link={inboxHref("for_you", { ...listQuery, view: "updates" })}
                  />
                </ul>
              )}

              {nextPost && <NextPostNote post={nextPost} />}
            </>,
          )}

          <CaughtUpCard activity={activity} />
        </div>
      ) : (
        <div className="grid gap-4 lg:min-h-[460px] lg:flex-1 lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] xl:grid-cols-[minmax(300px,400px)_minmax(0,1fr)]">
          {listCard(
            <>
              {entries.length === 0 ? (
                empty
              ) : (
                <ul
                  className="flex flex-col gap-0.5"

                  aria-label={found ? "Search results" : "Conversations"}
                >
                  {entries.map((e, i) => {
                    const meta = metaOf.get(e.itemId);

                    const heading =
                      grouped && meta && (i === 0 || metaOf.get(entries[i - 1].itemId)?.group !== meta.group)
                        ? meta.group
                        : null;

                    return (
                      <Fragment key={e.itemId}>
                        {heading && (
                          <li className="label flex items-center gap-1.5 px-3 pt-3 pb-1">
                            {GROUP_LABELS[heading]}

                            <span className="text-ink-3 tabular-nums">
                              {groupCounts.get(heading) ?? 0}
                            </span>
                          </li>
                        )}

                        <Row
                          entry={e}

                          meta={meta}

                          link={link(e.itemId)}

                          q={found ? q : undefined}

                          now={now}

                          selected={e.itemId === selected?.itemId}

                          action={
                            updatesView && canMove ? (
                              <MoveSenderButton
                                itemId={e.itemId}
                                name={e.authorName ?? "this sender"}
                              />
                            ) : undefined
                          }
                        />
                      </Fragment>
                    );
                  })}
                </ul>
              )}

              {!found && !updatesView && updatesCount > 0 && (
                <ul className="flex flex-col">
                  <UpdatesRow
                    count={updatesCount}
                    link={inboxHref("for_you", { ...listQuery, view: "updates" })}
                  />
                </ul>
              )}

              {nextPost && !found && !updatesView && <NextPostNote post={nextPost} />}
            </>,

            !!itemParam,
          )}

          {selected && (
            <div
              className={cn(
                "card grid min-h-0 min-w-0 overflow-hidden lg:grid-cols-[minmax(0,1fr)_230px] xl:grid-cols-[minmax(0,1fr)_260px]",

                !itemParam && "hidden lg:grid",
              )}
            >
              <div className="flex min-h-0 min-w-0 flex-col">
                {itemParam && (
                  <Link href={link()} className="text-ink-2 px-5 pt-3 text-sm lg:hidden">
                    ← All messages
                  </Link>
                )}

                <MarkItemRead itemId={selected.itemId} />

                {itemParam && <MarkConversationSeen itemId={selected.itemId} />}

                <ConversationPane
                  entry={selected}

                  newCount={selectedMeta?.automated ? 0 : (selectedMeta?.newMessages ?? 0)}

                  newSince={seenAt}

                  thread={
                    conversation?.thread ?? [
                      {
                        key: selected.itemId,

                        from: "customer",

                        text: selected.text,

                        at: selected.receivedAt,

                        itemId: selected.itemId,
                      },
                    ]
                  }

                  footer={
                    booking ? (
                      <>
                        {footer}

                        {booking}
                      </>
                    ) : (
                      footer
                    )
                  }
                />
              </div>

              {conversation && (
                <div className="border-line min-h-0 overflow-y-auto border-t p-5 lg:border-t-0 lg:border-l">
                  <ContextPanel context={conversation.context} />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
