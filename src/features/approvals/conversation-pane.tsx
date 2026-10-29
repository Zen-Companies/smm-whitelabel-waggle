import type { ReactNode } from "react";
import Link from "next/link";
import { Avatar } from "@/components/app/avatar";
import { CategoryLabel } from "@/components/app/category-label";
import { clockTime, dayLabel, platformName, shortTime } from "@/components/app/time";
import type { ConversationContext, ThreadMessage } from "./conversation-data";
import type { InboxEntry } from "./inbox-data";

// Design v2: the conversation is the detail. Header, the thread (customer left on gray, your
// replies right on white), and the footer (composer, problem box or sent status) at the bottom.

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
      className="card-lifted flex min-h-[560px] flex-col lg:min-h-[calc(100dvh-140px)]"
    >
      <div className="flex items-center gap-3 border-b px-4 py-4 md:px-5">
        <Avatar size={40} />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-semibold">{name}</span>
          <span className="meta">
            {platformName(entry.platform)} {entry.kind === "dm" ? "DM" : "comment"}
          </span>
        </span>
        <CategoryLabel category={entry.category} />
      </div>
      <ol className="flex flex-1 flex-col gap-3 px-4 py-5 md:px-5" aria-label="Messages">
        {thread.map((m, i) => {
          const day = dayLabel(m.at);
          const showDay = i === 0 || dayLabel(thread[i - 1].at) !== day;
          const mine = m.from === "business";
          return (
            <li key={m.key} className="flex flex-col gap-3">
              {showDay && <p className="meta self-center">{day}</p>}
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
                      ? "rounded-2xl rounded-br-sm border bg-white px-3.5 py-2.5 whitespace-pre-wrap"
                      : "rounded-2xl rounded-bl-sm bg-gray-50 px-3.5 py-2.5 whitespace-pre-wrap"
                  }
                >
                  {m.text || "(no text)"}
                </p>
                <span className="text-xs text-gray-600">
                  <time dateTime={m.at}>{clockTime(m.at)}</time>
                  {mine && (m.by === "you" ? " · Sent by you" : " · Auto")}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      {footer}
    </section>
  );
}

const ago = (iso: string) => {
  const label = shortTime(iso);
  return /\d:\d/.test(label) ? "today" : label === "Yesterday" ? "yesterday" : `on ${label}`;
};

/** Right panel: who is this, what do they want, what has happened (in that order). */
export function ContextPanel({ context }: { context: ConversationContext }) {
  const { customer, lead, activity } = context;
  return (
    <aside aria-label="About this customer" className="flex flex-col gap-4">
      <section className="card flex flex-col gap-3 p-4">
        <h2 className="meta">Customer</h2>
        <div className="flex items-center gap-3">
          <Avatar size={44} />
          <span className="flex min-w-0 flex-col">
            <span className="truncate font-semibold">{customer.name}</span>
            <span className="meta">{platformName(customer.platform)}</span>
          </span>
        </div>
        <p className="text-sm text-gray-700">
          {customer.messages === 1 ? "1 message" : `${customer.messages} messages`} · first message{" "}
          {ago(customer.firstSeenAt)}
        </p>
      </section>
      {lead && (
        <section className="card flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <h2 className="meta">Lead</h2>
            <span className="chip-lead">Saved</span>
          </div>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
            {lead.request && (
              <>
                <dt className="text-gray-600">Wants</dt>
                <dd>{lead.request}</dd>
              </>
            )}
            {lead.contact && (
              <>
                <dt className="text-gray-600">Contact</dt>
                <dd>{lead.contact}</dd>
              </>
            )}
          </dl>
          <Link href="/leads" className="text-sm font-medium underline underline-offset-4">
            View in Leads
          </Link>
        </section>
      )}
      {activity.length > 0 && (
        <section className="card flex flex-col gap-3 p-4">
          <h2 className="meta">Activity</h2>
          <ol className="flex flex-col gap-2 text-sm">
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
