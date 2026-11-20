"use client";

import { ageLabel } from "./copy";
import type { LostDm } from "./setup-data";
import { PagedList } from "./setup-parts";
import { TOPIC_LABEL } from "./topics";

/**
 * Screen 2.2's "The DMs you lost", 4 a page. A client component of its own: the paged list takes
 * a render function, which a server component can't hand to a client one.
 */
export function LostDmList({
  lost,
  platform,
  now,
}: {
  lost: LostDm[];
  platform: string;
  /** ISO time the page was rendered, so ages match the server's. */
  now: string;
}) {
  const at = new Date(now);
  return (
    <PagedList
      items={lost}
      size={4}
      label="The DMs you lost"
      header={
        <p className="border-line border-b px-3 py-2 text-[12.5px]">
          <b className="font-semibold">The DMs you lost.</b>{" "}
          <span className="text-ink-2">{platform} allows a reply within 24 hours only.</span>
        </p>
      }
      render={(l) => (
        <li
          key={l.key}
          className="flex flex-wrap justify-between gap-x-2 gap-y-0.5 px-3 py-2 text-[12.5px]"
        >
          <span className="min-w-0 flex-1 basis-48 break-words">
            <b className="font-semibold">{l.name}</b> <span className="text-ink-2">{l.text}</span>
          </span>
          <span className="text-ink-3 whitespace-nowrap">
            {TOPIC_LABEL[l.topic]} · {ageLabel(l.receivedAt, at)}
          </span>
        </li>
      )}
    />
  );
}
