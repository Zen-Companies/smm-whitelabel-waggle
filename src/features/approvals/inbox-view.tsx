import { CircleCheck, Clock3 } from "lucide-react";
import Link from "next/link";
import { CategoryLabel } from "@/components/app/category-label";
import { IllustratedEmpty } from "@/components/app/illustrated-empty";
import { clockTime, platformName, shortTime } from "@/components/app/time";
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
import {
  countInboxTabs,
  heldReason,
  INBOX_TABS,
  loadInboxTab,
  loadNextPost,
  loadTodaySummary,
  needsOwner,
  normalizeTab,
  responseTime,
  type InboxEntry,
  type InboxTab,
  type NextPost,
  type TodaySummary,
} from "./inbox-data";
import { InboxLive } from "./inbox-live";

// Inbox (design.md §4, §9): mobile first like the phone mockup (business name, Today card, filter
// chips, item cards, Next post card); on desktop list | conversation with the reply composer |
// context panel. On phone widths it's list → detail.

const href = (tab: InboxTab, item?: string, autoOnly = false) =>
  `/inbox?tab=${tab}${autoOnly ? "&by=auto" : ""}${item ? `&item=${item}` : ""}`;

/** Status at the right of a card header: ANSWERED · 6s, IGNORED, or the category. */
function RowStatus({ entry }: { entry: InboxEntry & { status: string } }) {
  if (entry.status === "sent" || entry.status === "sending") {
    return (
      <span className="status-plain">
        {entry.draft?.sentAt
          ? `Answered · ${responseTime(entry.receivedAt, entry.draft.sentAt)}`
          : "Sending"}
      </span>
    );
  }
  if (entry.status === "ignored") return <span className="status-plain">Ignored</span>;
  if (entry.status === "handled") return <span className="status-plain">Handled</span>;
  if (entry.status === "rejected") return <span className="status-plain">Not answered</span>;
  return <CategoryLabel category={entry.category} />;
}

/** One item card (design.md §4); a honey border when it needs the owner. */
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
  const reply =
    entry.draft && !entry.draft.needsHuman ? (entry.draft.editedBody ?? entry.draft.body) : null;
  return (
    <li>
      <Link
        href={href(tab, entry.itemId, autoOnly)}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "card flex flex-col gap-2 p-4 transition-colors duration-150",
          needs && "card-needs",
          selected ? "bg-hive-high" : "hover:bg-hive-high",
        )}
      >
        <span className="flex items-center gap-3">
          <span className="label min-w-0 truncate">
            {platformName(entry.platform)} · {entry.authorName ?? "A customer"}
          </span>
          <span className="ml-auto shrink-0">
            <RowStatus entry={entry} />
          </span>
        </span>
        <span className="text-wax-muted line-clamp-2">
          &ldquo;{entry.text || "(no text)"}&rdquo;
        </span>
        {reply && <span className="text-wax line-clamp-2">{reply}</span>}
        <time className="meta" dateTime={entry.receivedAt}>
          {entry.kind === "dm" ? "DM" : "Comment"} · {shortTime(entry.receivedAt)}
        </time>
      </Link>
    </li>
  );
}

/** The Today summary card (design.md §4): honey, three big numbers. */
function TodayCard({ today }: { today: TodaySummary }) {
  const numbers: [string, number][] = [
    ["answered", today.answered],
    ["for you", today.forYou],
    ["ignored", today.ignored],
  ];
  return (
    <section aria-labelledby="today" className="today-card flex flex-col gap-3 p-5">
      <h2 id="today" className="text-[13px] font-bold tracking-[0.12em] uppercase">
        Today
      </h2>
      <dl className="grid grid-cols-3 gap-3">
        {numbers.map(([label, n]) => (
          <div key={label} className="flex flex-col-reverse">
            <dt className="text-[15px] font-medium">{label}</dt>
            <dd className="text-3xl leading-none font-bold tabular-nums">{n}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** The Next post card at the bottom of the inbox (design.md §4). */
function NextPostCard({ post }: { post: NextPost }) {
  const when = new Date(post.scheduledFor).toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
  return (
    <Link href="/posts" className="card hover:bg-hive-high flex flex-col gap-1 p-4">
      <span className="label">Next post</span>
      <span className="font-semibold">{post.title}</span>
      <span className="meta">
        {post.platforms === 1 ? "1 account" : `${post.platforms} accounts`} ·{" "}
        <span className="text-honey font-semibold">{when}</span>
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
    <p className="bg-hive-high m-4 mt-0 inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm md:m-5 md:mt-0">
      {entry.status !== "sending" ? (
        <>
          <CircleCheck
            className={entry.status === "sent" ? "text-success" : "text-pollen"}
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

  const header = (
    <header className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <p className="label">{tenant.name}</p>
        <h1 className="page-title">Inbox</h1>
      </div>
      <TodayCard today={today} />
      <nav aria-label="Inbox filters" className="chips max-w-full">
        {INBOX_TABS.map((t) => (
          <Link key={t.key} href={href(t.key)} data-active={t.key === tab || undefined}>
            {t.label}
            <span className="tabular-nums opacity-70">{counts[t.key]}</span>
          </Link>
        ))}
      </nav>
      {tab === "answered" && (
        <nav aria-label="Answered filter" className="flex gap-4 text-sm">
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
                "flex min-h-11 items-center",
                f.active ? "text-honey font-semibold" : "hover:text-wax text-wax-muted",
              )}
            >
              {f.label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );

  // First run: nothing connected yet.
  if (!accounts) {
    return (
      <div className="flex flex-col gap-6">
        <h1 className="page-title">Inbox</h1>
        <IllustratedEmpty
          illustration="connect-accounts"
          title="Connect your Instagram"
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
        Nothing needs you. We&apos;ll email you when a customer does.
      </IllustratedEmpty>
    ) : (
      <p className="meta px-3 py-6">
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
  ) : held ? (
    <HeldCard key={selected.itemId} entry={selected} reason={reason} />
  ) : (
    <SentFooter entry={selected} />
  );

  return (
    <div className="flex flex-col gap-5">
      <InboxLive tenantId={tenant.id} />
      {header}
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
      {entries.length === 0 ? (
        empty
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)] xl:grid-cols-[minmax(240px,320px)_minmax(0,1fr)_minmax(240px,300px)]">
          <ul
            className={cn("flex flex-col gap-3", itemParam && "hidden lg:flex")}
            aria-label="Messages"
          >
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
          {selected && (
            <div className={cn("flex min-w-0 flex-col gap-3", !itemParam && "hidden lg:flex")}>
              {itemParam && (
                <Link
                  href={href(tab, undefined, autoOnly)}
                  className="text-wax-muted text-sm lg:hidden"
                >
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
      )}
      {nextPost && <NextPostCard post={nextPost} />}
    </div>
  );
}
