import type { ReactNode } from "react";
import Link from "next/link";
import { CategoryLabel } from "@/components/app/category-label";
import { BrandMark } from "@/components/app/platform-mark";
import { StateMark } from "@/components/app/state-mark";
import { clockTime, dayLabel, platformName, shortTime } from "@/components/app/time";
import { activityState, type ConversationContext, type ThreadMessage } from "./conversation-data";
import { openOnPlatformHref } from "./open-on-platform";
import { inboxRules } from "@/lib/social/platforms";
import type { InboxEntry } from "./inbox-data";
import { mediaLabel, previewIndex } from "./attachments";

// Inbox polish (approved 16 Nov): the conversation fills its card. A header with the channel's
// logo and Open in <app> stays put; under it the thread (on a warmer shade) and the footer (the
// composer, a problem box or the sent status) scroll together, so a long message gets the room.

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
  const open = openOnPlatformHref(entry);
  return (
    <section
      aria-label={`Conversation with ${name}`}
      className="flex min-h-[480px] min-w-0 flex-1 flex-col lg:min-h-0"
    >
      <div className="border-line flex min-h-14 flex-wrap items-center gap-x-2.5 gap-y-1 border-b px-5 py-2.5">
        <BrandMark brand={entry.platform} size={22} />
        <span className="truncate font-semibold">{name}</span>
        <span className="text-ink-3">
          {platformName(entry.platform)}{" "}
          {entry.kind === "dm" ? "DM" : entry.kind === "review" ? "review" : "comment"}
        </span>
        <CategoryLabel category={entry.category} />
        {open && (
          <a
            href={open}
            target="_blank"
            rel="noopener noreferrer"
            className="action-link with-arrow ml-auto text-sm"
          >
            Open in {platformName(entry.platform)}
          </a>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {entry.kind === "review" && entry.reviewRecommends !== null && (
          <p
            className={
              entry.reviewRecommends
                ? "text-ink-2 px-5 pt-4 text-[13px] font-medium"
                : "text-danger px-5 pt-4 text-[13px] font-medium"
            }
          >
            {entry.reviewRecommends ? "Recommends your Page" : "Doesn't recommend your Page"}
          </p>
        )}
        {entry.kind === "review" && entry.reviewRating ? (
          <p
            className={
              entry.reviewRating <= 2
                ? "text-danger px-5 pt-4 text-[13px] font-medium"
                : "text-ink-2 px-5 pt-4 text-[13px] font-medium"
            }
          >
            <span aria-hidden>
              {"★".repeat(entry.reviewRating)}
              {"☆".repeat(5 - entry.reviewRating)}{" "}
            </span>
            {entry.reviewRating}-star review
          </p>
        ) : null}
        <ol className="bg-page/50 flex min-h-40 flex-col gap-2 px-5 py-5" aria-label="Messages">
          {thread.map((m, i) => {
            const day = dayLabel(m.at);
            const showDay = i === 0 || dayLabel(thread[i - 1].at) !== day;
            const mine = m.from === "business";
            // T72: a photo shows as itself; words for anything else that came without text.
            const preview = mine ? null : previewIndex(entry.platform, m.attachments ?? []);
            const media = mine ? null : mediaLabel(m.attachments ?? []);
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
                  {preview !== null && (
                    // A fresh link each time (platform links expire), served through our route.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={`/inbox/items/${m.itemId}/attachments/${preview}`}
                      alt={media ?? "Photo"}
                      loading="lazy"
                      className="border-line bg-subtle max-h-64 max-w-full rounded-xl border object-contain"
                    />
                  )}
                  {(m.text || preview === null) && (
                    <p
                      className={
                        mine
                          ? "bg-ink rounded-xl rounded-br-[4px] px-3.5 py-2 whitespace-pre-wrap text-white"
                          : "bg-subtle rounded-xl rounded-bl-[4px] px-3.5 py-2 whitespace-pre-wrap"
                      }
                    >
                      {m.text || (
                        <span className="text-ink-2 italic">
                          {media ?? "Sent something without words"}
                        </span>
                      )}
                    </p>
                  )}
                  {m.text && media && preview === null && (
                    <span className="text-ink-3 text-xs">{media}</span>
                  )}
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
          <p className="text-ink-2 px-5 pt-3 text-[13px]">
            {platformName(entry.platform)} comments reach Waggle every few minutes, so this one may
            have arrived a little after it was written.
          </p>
        )}
        <div className="border-line flex flex-col gap-3 border-t px-5 py-4">{footer}</div>
      </div>
    </section>
  );
}

/** "7:43 PM" today; "Oct 28, 7:43 PM" on another day. */
const when = (iso: string) => {
  const label = shortTime(iso);
  return /\d:\d/.test(label) ? label : `${label}, ${clockTime(iso)}`;
};

const WRITTEN_FROM = "Reply written from ";

const ago = (iso: string) => {
  const label = shortTime(iso);
  return /\d:\d/.test(label) ? "today" : label === "Yesterday" ? "yesterday" : `on ${label}`;
};

/** Right column of the card: who is this, what do they want, what has happened. */
export function ContextPanel({ context }: { context: ConversationContext }) {
  const { customer, lead, activity } = context;
  return (
    <aside aria-label="About this customer" className="flex flex-col gap-6 text-[13px]">
      <section className="flex flex-col gap-1">
        <h2 className="label">Customer</h2>
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-sm font-semibold">{customer.name}</span>
          <span className="text-ink-2 flex items-center gap-1.5">
            <BrandMark brand={customer.platform} size={16} />
            {platformName(customer.platform)}
          </span>
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
          <Link href={`/contacts/leads?lead=${lead.id}`} className="action-link with-arrow">
            View in Leads
          </Link>
        </section>
      )}
      {activity.length > 0 && (
        <section className="flex flex-col gap-1.5">
          <h2 className="label">Activity</h2>
          <ol className="relative flex flex-col gap-2.5">
            <span aria-hidden className="bg-line absolute top-2 bottom-2 left-[5.5px] w-px" />
            {activity.map((a, i) => (
              <li key={i} className="relative flex gap-2.5">
                <span className="bg-surface relative mt-[3px] flex h-fit py-px">
                  <StateMark state={activityState(a.text)} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span>
                    {a.text.startsWith(WRITTEN_FROM) ? (
                      <>
                        {WRITTEN_FROM}
                        <Link href="/teach/business-info" className="link-inline">
                          {a.text.slice(WRITTEN_FROM.length)}
                        </Link>
                      </>
                    ) : (
                      a.text
                    )}
                  </span>
                  <time dateTime={a.at} className="meta">
                    {when(a.at)}
                  </time>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </aside>
  );
}
