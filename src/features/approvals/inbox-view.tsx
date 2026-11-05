import { BookOpen, Check, CircleAlert, CircleCheck, Clock3, UserPlus } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/app/avatar";
import { IllustratedEmpty } from "@/components/app/illustrated-empty";
import { clockTime, shortTime } from "@/components/app/time";
import { buttonVariants } from "@/components/ui/button";
import { MarkItemRead } from "@/features/alerts";
import { getCurrentTenant } from "@/features/tenants";
import { loadTenantAiSpend } from "@/lib/llm/spend";
import { createServerSupabase } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { cn } from "cn";
import { allowanceNotice } from "./allowance-notice";
import { ApprovalCard, RecentSends } from "./approval-card";
import { loadConversation } from "./conversation-data";
import { ContextPanel, ConversationPane } from "./conversation-pane";
import { HeldCard } from "./held-card";
import { SpamCard, SpamCommentFooter } from "./spam-card";
import {
  countInboxTabs,
  heldReason,
  INBOX_TABS,
  loadInboxTab,
  loadNextPost,
  loadTodaySummary,
  todayLine,
  needsOwner,
  normalizeTab,
  type InboxEntry,
  type InboxTab,
  type NextPost,
  type TodaySummary,
} from "./inbox-data";
import { InboxLive } from "./inbox-live";
import { rowNote, type RowTone } from "./row-note";

// Inbox (design.md v3 Paper): a headline ("4 things need you"), then list | conversation with the
// reply composer | side panel on desktop; list → conversation on phones. Rows follow the ten rules:
// no boxes or stripes, a honey dot when the owner must act, three lines per row.

const href = (tab: InboxTab, item?: string, autoOnly = false) =>
  `/inbox?tab=${tab}${autoOnly ? "&by=auto" : ""}${item ? `&item=${item}` : ""}`;

const NOTE_ICON: Record<RowTone, React.ReactNode> = {
  lead: <UserPlus className="text-honey-text size-3.5" strokeWidth={2} aria-hidden />,
  complaint: <CircleAlert className="text-danger size-3.5" strokeWidth={2} aria-hidden />,
  info: <BookOpen className="size-3.5" strokeWidth={2} aria-hidden />,
  done: <Check className="text-success size-3.5" strokeWidth={2.2} aria-hidden />,
  none: null,
};

/** One list row (design.md §1 rules 2 and 4): who · what they said · what happens next. */
function Row({
  entry,
  tab,
  selected,
  autoOnly,
}: {
  entry: InboxEntry & { status: string };
  tab: InboxTab;
  selected: boolean;
  autoOnly: boolean;
}) {
  const needs = needsOwner(entry.status);
  const note = rowNote(entry);
  return (
    <li className="border-line border-t first:border-t-0">
      <Link
        href={href(tab, entry.itemId, autoOnly)}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "-mx-3 flex gap-3 rounded-md px-3 py-3.5 transition-colors duration-150",
          selected ? "bg-subtle" : "hover:bg-subtle/60",
        )}
      >
        <Avatar size={36} platform={entry.platform} />
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
          </span>
          <span className={cn("truncate", needs ? "text-ink-2" : "text-ink-3")}>
            {entry.text || "(no text)"}
          </span>
          <span className="text-ink-3 flex items-center gap-1.5 text-[13px]">
            {NOTE_ICON[note.tone]}
            {note.label && (
              <span
                className={cn(
                  "font-medium",
                  note.tone === "lead" ? "text-honey-text" : "text-danger",
                )}
              >
                {note.label}
              </span>
            )}
            {note.label ? `· ${note.text}` : note.text}
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
      className="border-line mt-2 flex flex-col gap-0.5 border-t pt-4 text-[13px] hover:underline"
    >
      <span className="label">Next post</span>
      <span className="text-ink text-sm">{post.title}</span>
      <span className="text-ink-2">
        {when} · {post.platforms === 1 ? "1 account" : `${post.platforms} accounts`}
      </span>
    </Link>
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
            className={entry.status === "sent" ? "text-success" : "text-ink-3"}
            strokeWidth={1.75}
            aria-hidden
          />
          {done[entry.status] ??
            `${entry.draft && !entry.draft.decidedByOwner ? "Answered on its own" : "Answered"}${
              entry.draft?.sentAt ? ` · ${clockTime(entry.draft.sentAt)}` : ""
            }`}
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
  // Answered tab: all, or only the replies that went out on their own (T27).
  const autoOnly = tab === "answered" && params.by === "auto";

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
  const entries = autoOnly
    ? tabEntries.filter((e) => e.draft && !e.draft.decidedByOwner)
    : tabEntries;

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
        <nav aria-label="Answered filter" className="flex gap-4 pt-2 text-[13px]">
          {[
            { label: "All answered", href: href("answered"), active: !autoOnly },
            {
              label: "Answered on its own",
              href: href("answered", undefined, true),
              active: autoOnly,
            },
          ].map((f) => (
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

  // First run: nothing connected yet.
  if (!accounts) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="page-title">Connect your Instagram</h1>
        <IllustratedEmpty
          illustration="connect-accounts"
          title="Waggle is ready when you are"
          action={
            <Link href="/settings" className={buttonVariants({ variant: "primary" })}>
              Connect an account
            </Link>
          }
        >
          Once your shop&apos;s account is connected, comments and messages show up here with a
          reply ready for you to check.
        </IllustratedEmpty>
      </div>
    );
  }

  const empty =
    tab === "for_you" ? (
      <IllustratedEmpty illustration="inbox-clear" title="All caught up">
        Nothing needs you. Go run the shop; we&apos;ll email you when a customer does.
      </IllustratedEmpty>
    ) : (
      <p className="meta py-6">
        {tab === "ignored"
          ? "Spam and messages that need no reply show up here."
          : autoOnly
            ? "Nothing has gone out on its own yet."
            : "Replies that went out show up here."}
      </p>
    );

  const conversation = selected
    ? await loadConversation(supabase, tenant.id, selected.itemId)
    : null;
  const footer = !selected ? null : selected.status === "awaiting_approval" ? (
    <ApprovalCard
      key={selected.itemId}
      entry={selected}
      nextHref={next ? href(tab, next.itemId) : null}
    />
  ) : held && reason === "spam" && selected.category === "spam" && selected.kind === "comment" ? (
    // T40: a spam comment comes to the owner to hide; it's never answered.
    <SpamCard key={selected.itemId} entry={selected} />
  ) : held ? (
    <HeldCard key={selected.itemId} entry={selected} reason={reason} />
  ) : selected.kind === "comment" &&
    (selected.hiddenOnPlatformAt ||
      (selected.category === "spam" &&
        (selected.status === "ignored" || selected.status === "handled"))) ? (
    <SpamCommentFooter key={selected.itemId} entry={selected} />
  ) : (
    <SentFooter entry={selected} />
  );

  return (
    <div className="flex flex-col gap-5">
      <InboxLive tenantId={tenant.id} />
      <InboxHeadline today={today} />
      {settings?.replies_paused && (
        <p role="status" className="banner">
          Replies are paused. Nothing is sent until you turn them back on in{" "}
          <Link href="/settings?section=replies" className="font-semibold underline">
            Settings → Replies
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
      <div className="grid items-start gap-8 lg:grid-cols-[minmax(280px,360px)_minmax(0,600px)] xl:grid-cols-[minmax(280px,360px)_minmax(0,600px)_220px]">
        <div className={cn("flex min-w-0 flex-col", itemParam && "hidden lg:flex")}>
          {tabs}
          {entries.length === 0 ? (
            empty
          ) : (
            <ul className="flex flex-col pt-1" aria-label="Messages">
              {entries.map((e) => (
                <Row
                  key={e.itemId}
                  entry={e}
                  tab={tab}
                  autoOnly={autoOnly}
                  selected={e.itemId === selected?.itemId}
                />
              ))}
            </ul>
          )}
          {nextPost && <NextPostNote post={nextPost} />}
        </div>
        {selected && (
          <div className={cn("flex min-w-0 flex-col gap-3", !itemParam && "hidden lg:flex")}>
            {itemParam && (
              <Link href={href(tab, undefined, autoOnly)} className="text-ink-2 text-sm lg:hidden">
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
              footer={footer}
            />
          </div>
        )}
        {selected && conversation && (
          <div className={cn("lg:col-start-2 xl:col-start-3", !itemParam && "hidden lg:block")}>
            <ContextPanel context={conversation.context} />
          </div>
        )}
      </div>
    </div>
  );
}
