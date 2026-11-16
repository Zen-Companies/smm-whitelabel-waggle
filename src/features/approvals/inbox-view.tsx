import { CircleCheck, Clock3 } from "lucide-react";
import Link from "next/link";
import { ActionLink } from "@/components/app/action-link";
import { Avatar } from "@/components/app/avatar";
import { EmptySpot } from "@/components/app/empty-spot";
import { StateLabel } from "@/components/app/state-mark";
import { clockTime, shortTime } from "@/components/app/time";
import { BrandSetup } from "@/features/accounts";
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
  countInboxTabs,
  heldReason,
  normalizeAnsweredBy,
  type AnsweredBy,
  INBOX_TABS,
  loadInboxTab,
  loadNextPost,
  loadTodayActivity,
  loadTodaySummary,
  searchInbox,
  searchPattern,
  tabOf,
  todayLine,
  needsOwner,
  normalizeTab,
  type InboxEntry,
  type InboxTab,
  type NextPost,
  type TodaySummary,
} from "./inbox-data";
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

const href = (tab: InboxTab, item?: string, by: AnsweredBy | "all" = "all") =>
  `/inbox?tab=${tab}${by !== "all" ? `&by=${by}` : ""}${item ? `&item=${item}` : ""}`;

/** One list row (design.md §1 rules 2 and 4): who · what they said · what happens next. */
function Row({
  entry,
  link,
  selected,
  q,
}: {
  entry: InboxEntry & { status: string };
  link: string;
  selected: boolean;
  /** While searching: the words to highlight, and the row says which tab it's in. */
  q?: string;
}) {
  const needs = needsOwner(entry.status);
  const note = rowNote(entry);
  const words = messageWords(entry.text, entry.attachments ?? []);
  const inTab = q ? INBOX_TABS.find((t) => t.key === tabOf(entry.status))?.label : undefined;
  return (
    <li>
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
            <time
              className="text-ink-3 ml-auto shrink-0 text-[13px] tabular-nums"
              dateTime={entry.receivedAt}
            >
              {shortTime(entry.receivedAt)}
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
          <span className="mt-0.5 flex min-w-0">
            <StateLabel
              state={rowState(entry.status, note.tone)}
              className="min-w-0 text-[13px] whitespace-normal"
            >
              {note.label ? `${note.label} · ${note.text}` : note.text}
            </StateLabel>
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
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  // Old links (?tab=waiting / needs / sent) land on the tab that now holds those items.
  const tab = normalizeTab(typeof params.tab === "string" ? params.tab : undefined);
  const itemParam = typeof params.item === "string" ? params.item : undefined;
  // Search (Inbox polish, approved 16 Nov): names and words across all three tabs.
  const q = typeof params.q === "string" ? params.q.slice(0, 80) : "";
  const pattern = searchPattern(q);
  // Answered tab (T27, T72): all, or by who answered.
  const by =
    tab === "answered"
      ? normalizeAnsweredBy(typeof params.by === "string" ? params.by : undefined)
      : "all";

  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  const [tabEntries, counts, { count: accounts }, { data: settings }, spend, today, nextPost] =
    await Promise.all([
      loadInboxTab(supabase, tenant.id, tab),
      countInboxTabs(supabase, tenant.id),
      supabase
        .from("social_accounts")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenant.id),
      supabase.from("tenants").select("replies_paused").eq("id", tenant.id).single(),
      // T32: this month's AI allowance (service role: spend is summed across ai_usage).
      loadTenantAiSpend(getServiceClient(), tenant.id, new Date()),
      loadTodaySummary(supabase, tenant.id),
      loadNextPost(supabase, tenant.id),
    ]);
  const allowance = allowanceNotice(spend);
  const found = pattern ? await searchInbox(supabase, tenant.id, pattern) : null;
  const entries = found
    ? found
    : by === "all"
      ? tabEntries
      : tabEntries.filter((e) => answeredBy(e) === by);
  const link = (item?: string) =>
    found ? `/inbox?q=${encodeURIComponent(q)}${item ? `&item=${item}` : ""}` : href(tab, item, by);
  const byCounts = new Map<string, number>([["all", tabEntries.length]]);
  for (const e of tabEntries) {
    const who = answeredBy(e);
    if (who) byCounts.set(who, (byCounts.get(who) ?? 0) + 1);
  }

  const selected = entries.find((e) => e.itemId === itemParam) ?? entries[0];
  const index = selected ? entries.indexOf(selected) : -1;
  const next = index >= 0 && index + 1 < entries.length ? entries[index + 1] : null;
  const held = selected && (selected.status === "escalated" || selected.status === "failed");
  const reason = held ? await heldReason(supabase, selected.itemId, selected.status) : null;

  // Tabs sit on top of the list (design.md §4): text with an ink underline, counts in gray.
  const tabs = (
    <div className="flex flex-col">
      <nav aria-label="Inbox filters" className="tabs">
        {INBOX_TABS.map((t) => (
          <Link key={t.key} href={href(t.key)} data-active={t.key === tab || undefined}>
            {t.label}
            <span>{counts[t.key]}</span>
          </Link>
        ))}
      </nav>
      {tab === "answered" && (
        <nav aria-label="Answered filter" className="flex flex-wrap gap-x-4 pt-2 text-[13px]">
          {ANSWERED_FILTERS.map((f) => ({
            label: `${f.label} ${byCounts.get(f.key) ?? 0}`,
            href: href("answered", undefined, f.key),
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

  const listCard = (body: React.ReactNode, hideOnPhone = false) => (
    <div
      className={cn(
        "card flex min-h-0 min-w-0 flex-col overflow-hidden",
        hideOnPhone && "hidden lg:flex",
      )}
    >
      <div className="border-line flex flex-col gap-2 border-b px-3.5 pt-3.5">
        <InboxSearch initial={q} />
        {found ? (
          <p className="text-ink-3 pt-1 pb-3 text-[13px]" role="status">
            {found.length === 0
              ? "Nothing found"
              : `${found.length === 1 ? "1 conversation" : `${found.length} conversations`} with \u201c${q.trim()}\u201d, across all tabs`}
          </p>
        ) : (
          <div className="[&_.tabs]:border-b-0">{tabs}</div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">{body}</div>
    </div>
  );

  // First run of a brand: nothing connected yet (T47 "Set up <brand>").
  if (!accounts) return <BrandSetup brandName={tenant.name} />;

  const empty = found ? (
    <EmptySpot className="px-2 py-6" action={<ActionLink href="/inbox">Clear search</ActionLink>}>
      <b className="text-ink font-semibold">No messages mention &ldquo;{q.trim()}&rdquo;</b>
      <br />
      Search looks at names, messages and Waggle&apos;s replies in all three tabs.
    </EmptySpot>
  ) : (
    <p className="meta px-2 py-6">
      {tab === "ignored"
        ? "Spam Waggle hid and messages that needed no reply show up here. Anything here can go back to For you."
        : by === "auto"
          ? "Nothing has gone out on its own yet."
          : by !== "all"
            ? "Nothing here yet."
            : "Replies that went out show up here."}
    </p>
  );

  // Nothing for the owner: the space a conversation would take shows what Waggle did today.
  const caughtUp = !found && tab === "for_you" && entries.length === 0;
  const activity = caughtUp ? await loadTodayActivity(supabase, tenant.id) : [];

  const conversation = selected
    ? await loadConversation(supabase, tenant.id, selected.itemId)
    : null;
  // T67: a WhatsApp chat past its 24 hours can only be restarted with an approved template.
  const waWindow =
    selected && whatsappWindowClosed(selected)
      ? await loadTemplateChoices(supabase, getSocialProvider(), selected)
      : null;
  const actionFooter = !selected ? null : selected.kind === "call" ? (
    // T82b: a missed call or voicemail: listen, call back, mark handled. Never a reply.
    <CallCard key={selected.itemId} entry={selected} />
  ) : selected.status === "awaiting_approval" ? (
    <ApprovalCard
      key={selected.itemId}
      entry={selected}
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
  const footer = !selected ? null : actionFooter ? (
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
      <RecentSends />
      {caughtUp ? (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(300px,400px)_minmax(0,1fr)]">
          {listCard(
            <>
              <p className="meta px-2 py-4 text-[13px]">
                Nothing waiting. New messages show up here.
              </p>
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
                  aria-label={found ? "Search results" : "Messages"}
                >
                  {entries.map((e) => (
                    <Row
                      key={e.itemId}
                      entry={e}
                      link={link(e.itemId)}
                      q={found ? q : undefined}
                      selected={e.itemId === selected?.itemId}
                    />
                  ))}
                </ul>
              )}
              {nextPost && !found && <NextPostNote post={nextPost} />}
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
                <ConversationPane
                  entry={selected}
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
