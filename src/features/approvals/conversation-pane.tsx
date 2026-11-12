import type { ReactNode } from "react";
import Link from "next/link";
import { CategoryLabel } from "@/components/app/category-label";
import { clockTime, dayLabel, platformName, shortTime } from "@/components/app/time";
import type { ConversationContext, ThreadMessage } from "./conversation-data";
import { inboxRules } from "@/lib/social/platforms";
import type { InboxEntry } from "./inbox-data";

// Paper (design.md §4): the conversation sits on the page, no box. A header line, the thread
// (customer on subtle gray, the business in ink), then the footer: the composer (the one boxed
// object), a problem box or the sent status.

export function ConversationPane({
  entry,
  thread,
  footer,
}: {
  entry: InboxEntry;
  thread: ThreadMessage[];
  footer: ReactNode;
}) {
  const name = entry.authorName ?? "A customer";
  return (
    <section
      aria-label={`Conversation with ${name}`}
      className="flex min-h-[520px] flex-col lg:min-h-[calc(100dvh-180px)]"
    >
      <div className="border-line flex min-h-11 items-center gap-2 border-b">
        <span className="truncate font-semibold">{name}</span>
        <span className="text-ink-3">
          {platformName(entry.platform)}{" "}
          {entry.kind === "dm" ? "DM" : entry.kind === "review" ? "review" : "comment"}
        </span>
        <span className="ml-auto">
          <CategoryLabel category={entry.category} />
        </span>
      </div>
      {entry.kind === "review" && entry.reviewRecommends !== null && (
        <p
          className={
            entry.reviewRecommends
              ? "text-ink-2 pt-4 text-[13px] font-medium"
              : "text-danger pt-4 text-[13px] font-medium"
          }
        >
          {entry.reviewRecommends ? "Recommends your Page" : "Doesn't recommend your Page"}
        </p>
      )}
      {entry.kind === "review" && entry.reviewRating ? (
        <p
          className={
            entry.reviewRating <= 2
              ? "text-danger pt-4 text-[13px] font-medium"
              : "text-ink-2 pt-4 text-[13px] font-medium"
          }
        >
          <span aria-hidden>
            {"★".repeat(entry.reviewRating)}
            {"☆".repeat(5 - entry.reviewRating)}{" "}
          </span>
          {entry.reviewRating}-star review
        </p>
      ) : null}
      <ol className="flex flex-1 flex-col gap-2 py-5" aria-label="Messages">
        {thread.map((m, i) => {
          const day = dayLabel(m.at);
          const showDay = i === 0 || dayLabel(thread[i - 1].at) !== day;
          const mine = m.from === "business";
          return (
            <li key={m.key} className="flex flex-col gap-3">
              {showDay && <p className="label self-center">{day}</p>}
              <div
                className={
                  mine
                    ? "flex max-w-[80%] flex-col items-end gap-1 self-end md:max-w-[70%]"
                    : "flex max-w-[80%] flex-col gap-1 self-start md:max-w-[70%]"
                }
              >
                <p
                  className={
                    mine
                      ? "bg-ink rounded-xl rounded-br-[4px] px-3.5 py-2 whitespace-pre-wrap text-white"
                      : "bg-subtle rounded-xl rounded-bl-[4px] px-3.5 py-2 whitespace-pre-wrap"
                  }
                >
                  {m.text || "(no text)"}
                </p>
                <span className="text-ink-3 text-xs">
                  <time dateTime={m.at}>{clockTime(m.at)}</time>
                  {mine && (m.by === "you" ? " · Sent by you" : " · Auto")}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      {entry.kind === "comment" && inboxRules(entry.platform).commentsPolled && (
        // T66: YouTube, LinkedIn and Bluesky comments reach Waggle by polling.
        <p className="text-ink-2 mb-3 text-[13px]">
          {platformName(entry.platform)} comments reach Waggle every few minutes, so this one may
          have arrived a little after it was written.
        </p>
      )}
      {footer}
    </section>
  );
}

const ago = (iso: string) => {
  const label = shortTime(iso);
  return /\d:\d/.test(label) ? "today" : label === "Yesterday" ? "yesterday" : `on ${label}`;
};

/** Right panel: who is this, what do they want, what has happened. Plain text, no boxes. */
export function ContextPanel({ context }: { context: ConversationContext }) {
  const { customer, lead, activity } = context;
  return (
    <aside aria-label="About this customer" className="flex flex-col gap-6 pt-2 text-[13px]">
      <section className="flex flex-col gap-1">
        <h2 className="label">Customer</h2>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold">{customer.name}</span>
          <span className="text-ink-2">{platformName(customer.platform)}</span>
        </span>
        <p className="text-ink-2">
          {customer.messages === 1 ? "1 message" : `${customer.messages} messages`} · first message{" "}
          {ago(customer.firstSeenAt)}
        </p>
      </section>
      {lead && (
        <section className="flex flex-col gap-1.5">
          <h2 className="label">Lead · saved</h2>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
            {lead.request && (
              <>
                <dt className="text-ink-3">Wants</dt>
                <dd>{lead.request}</dd>
              </>
            )}
            {lead.contact && (
              <>
                <dt className="text-ink-3">Contact</dt>
                <dd>{lead.contact}</dd>
              </>
            )}
          </dl>
          <Link
            href={`/leads?lead=${lead.id}`}
            className="text-honey-text font-medium underline underline-offset-4"
          >
            View in Leads
          </Link>
        </section>
      )}
      {activity.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h2 className="label">Activity</h2>
          <ol className="text-ink-2 flex flex-col gap-1.5">
            {activity.map((a, i) => (
              <li key={i} className="flex gap-2.5">
                <time dateTime={a.at} className="meta w-16 shrink-0">
                  {shortTime(a.at)}
                </time>
                {a.text}
              </li>
            ))}
          </ol>
        </section>
      )}
    </aside>
  );
}
