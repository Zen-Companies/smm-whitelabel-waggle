import { CircleCheck, Clock3 } from "lucide-react";
import Link from "next/link";
import { Avatar } from "@/components/app/avatar";
import { CategoryLabel } from "@/components/app/category-label";
import { IllustratedEmpty } from "@/components/app/illustrated-empty";
import { clockTime, platformName, shortTime } from "@/components/app/time";
import { buttonVariants } from "@/components/ui/button";
import { MarkItemRead } from "@/features/alerts";
import { getCurrentTenant } from "@/features/tenants";
import { createServerSupabase } from "@/lib/supabase/server";
import { cn } from "cn";
import { ApprovalCard, MessageHeader, RecentSends } from "./approval-card";
import { HeldCard } from "./held-card";
import {
  countInboxTabs,
  heldReason,
  INBOX_TABS,
  loadInboxTab,
  type InboxEntry,
  type InboxTab,
} from "./inbox-data";
import { InboxLive } from "./inbox-live";

// Two-pane inbox (docs/design.md §3, §8): list with dividers on the left, the selected message on
// the right. On phone widths it's list → detail.

const href = (tab: InboxTab, item?: string) => `/inbox?tab=${tab}${item ? `&item=${item}` : ""}`;

function Row({
  entry,
  tab,
  selected,
}: {
  entry: InboxEntry & { status: string };
  tab: InboxTab;
  selected: boolean;
}) {
  const waiting = entry.status === "awaiting_approval";
  return (
    <li>
      <Link
        href={href(tab, entry.itemId)}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex gap-3 rounded-md px-3 py-3 transition-colors duration-150",
          selected ? "bg-lavender" : "hover:bg-gray-50",
        )}
      >
        <Avatar size={36} />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <span className={cn("truncate", waiting ? "font-semibold" : "font-medium")}>
              {entry.authorName ?? "A customer"}
            </span>
            <time className="meta ml-auto shrink-0" dateTime={entry.receivedAt}>
              {shortTime(entry.receivedAt)}
            </time>
          </span>
          <span className="truncate text-sm text-gray-700">{entry.text || "(no text)"}</span>
          <span className="flex items-center gap-2">
            <span className="meta">
              {platformName(entry.platform)} {entry.kind === "dm" ? "DM" : "comment"}
            </span>
            <CategoryLabel category={entry.category} />
          </span>
        </span>
      </Link>
    </li>
  );
}

function SentCard({ entry }: { entry: InboxEntry & { status: string } }) {
  const reply = entry.draft ? (entry.draft.editedBody ?? entry.draft.body) : null;
  return (
    <article className="card-lifted flex flex-col gap-4 p-5 md:p-6">
      <MessageHeader entry={entry} />
      <p className="whitespace-pre-wrap">{entry.text || "(no text)"}</p>
      {reply && (
        <div className="flex flex-col gap-2 rounded-md bg-gray-50 p-4">
          <p className="meta">Your reply</p>
          <p className="whitespace-pre-wrap">{reply}</p>
        </div>
      )}
      <p className="inline-flex items-center gap-2 text-sm">
        {entry.status === "sent" ? (
          <>
            <CircleCheck className="text-success" strokeWidth={1.75} aria-hidden />
            Sent{entry.draft?.sentAt ? ` · ${clockTime(entry.draft.sentAt)}` : ""}
          </>
        ) : (
          <>
            <Clock3 strokeWidth={1.75} aria-hidden />
            Sending now
          </>
        )}
      </p>
      <Link href={`/inbox/items/${entry.itemId}`} className="text-sm underline underline-offset-4">
        Open the conversation
      </Link>
    </article>
  );
}

export async function InboxView({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const tabParam = typeof params.tab === "string" ? params.tab : "waiting";
  const tab: InboxTab = INBOX_TABS.some((t) => t.key === tabParam)
    ? (tabParam as InboxTab)
    : "waiting";
  const itemParam = typeof params.item === "string" ? params.item : undefined;

  const tenant = await getCurrentTenant();
  const supabase = await createServerSupabase();
  const [entries, counts, { count: accounts }] = await Promise.all([
    loadInboxTab(supabase, tenant.id, tab),
    countInboxTabs(supabase, tenant.id),
    supabase
      .from("social_accounts")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenant.id),
  ]);

  const selected = entries.find((e) => e.itemId === itemParam) ?? entries[0];
  const index = selected ? entries.indexOf(selected) : -1;
  const next = index >= 0 && index + 1 < entries.length ? entries[index + 1] : null;
  const reason =
    selected && tab === "needs"
      ? await heldReason(supabase, selected.itemId, selected.status)
      : null;

  const tabs = (
    <nav aria-label="Inbox filters" className="segmented max-w-full self-start overflow-x-auto">
      {INBOX_TABS.map((t) => (
        <Link key={t.key} href={href(t.key)} data-active={t.key === tab || undefined}>
          {t.label}
          <span className="meta ml-2 tabular-nums">{counts[t.key]}</span>
        </Link>
      ))}
    </nav>
  );

  // First run: nothing connected yet.
  if (!accounts) {
    return (
      <div className="flex flex-col gap-6">
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
    tab === "waiting" ? (
      <IllustratedEmpty illustration="inbox-clear" title="You're all caught up">
        New replies show up here for you to check. We&apos;ll email you when something needs you.
      </IllustratedEmpty>
    ) : (
      <p className="meta px-3 py-6">
        {tab === "needs" ? "Nothing needs you right now." : "Replies you've sent show up here."}
      </p>
    );

  return (
    <div className="flex flex-col gap-6">
      <InboxLive tenantId={tenant.id} />
      {tabs}
      <RecentSends />
      {entries.length === 0 ? (
        empty
      ) : (
        <div className="grid gap-6 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <ul
            className={cn("flex flex-col divide-y", itemParam && "hidden md:flex")}
            aria-label="Messages"
          >
            {entries.map((e) => (
              <Row key={e.itemId} entry={e} tab={tab} selected={e.itemId === selected?.itemId} />
            ))}
          </ul>
          <section className={cn("flex flex-col gap-3", !itemParam && "hidden md:flex")}>
            {itemParam && (
              <Link href={href(tab)} className="text-sm text-gray-700 md:hidden">
                ← All messages
              </Link>
            )}
            {selected && <MarkItemRead itemId={selected.itemId} />}
            {selected &&
              (tab === "waiting" ? (
                <ApprovalCard
                  key={selected.itemId}
                  entry={selected}
                  nextHref={next ? href(tab, next.itemId) : null}
                />
              ) : tab === "needs" ? (
                <HeldCard key={selected.itemId} entry={selected} reason={reason} />
              ) : (
                <SentCard entry={selected} />
              ))}
            {selected && tab !== "sent" && (
              <Link
                href={`/inbox/items/${selected.itemId}`}
                className="text-sm text-gray-700 underline underline-offset-4"
              >
                Open the full conversation
              </Link>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
