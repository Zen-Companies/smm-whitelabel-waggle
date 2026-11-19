import { viewerTimeZone } from "@/lib/time/viewer-zone";

import Link from "next/link";

import { ArrowRight } from "lucide-react";

import { ActionLink } from "@/components/app/action-link";

import { Bee } from "@/components/app/bee";

import { PlatformMark } from "@/components/app/platform-mark";

import { StateLabel } from "@/components/app/state-mark";

import { buttonVariants } from "@/components/ui/button";

import {
  CaughtUpCard,
  decideDraft,
  loadTodayActivity,
  messageWords,
  reasonChip,
  REPLY_MAX,
  sendAllReadyAction,
  undoApprovalAction,
  UNDO_WINDOW_MS,
  URGENT_CHIPS,
} from "@/features/approvals";

import { CatchUpCard } from "@/features/catch-up";

import { can } from "@/features/orgs";

import { ReadyLine } from "@/features/setup";

import { getCurrentTenant } from "@/features/tenants";

import { platformLabel } from "@/lib/social/platforms";

import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";

import { loadToday } from "./data";

import { Greeting, LocalWhen, TodayDate } from "./greeting";

import { ReadyList, type ReadyItem } from "./ready-list";

import {
  firstName,
  joinNames,
  leadsLine,
  onlyYouLine,
  replyTime,
  shortAgo,
  sinceYesterdayLine,
} from "./today";

const SHOWN = 8;

const KIND_WORD: Record<string, string> = {
  dm: "DM",

  comment: "comment",

  review: "review",

  call: "call",
};

const where = (platform: string, kind: string) =>
  `${platformLabel(platform)} ${KIND_WORD[kind] ?? ""}`.trim();

function Tile({
  href,

  chip,

  tone,

  count,

  line,

  strong,
}: {
  href: string;

  chip: string;

  tone: string;

  count: number;

  line: string;

  strong?: boolean;
}) {
  return (
    <Link
      href={href}

      className={`card text-ink block p-[22px] no-underline ${strong ? "border-honey ring-honey ring-1" : ""}`}
    >
      <span className="flex items-center justify-between">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}>{chip}</span>

        <ArrowRight className="text-ink-3 size-[18px]" aria-hidden />
      </span>

      <span className="font-display mt-4 mb-1 block text-[44px] leading-none font-semibold">
        {count}
      </span>

      <span className="text-ink-2 block text-sm">{line}</span>
    </Link>
  );
}

/** Today, the home (T71, design "1 · Today"). */

export async function TodayView() {
  const tenant = await getCurrentTenant();

  const [supabase, user] = await Promise.all([createServerSupabase(), getCurrentUser()]);

  const now = new Date();

  const data = await loadToday(supabase, tenant.id, now);

  const canSend = can(tenant.role, "replies.approve");

  const chips = data.onlyYou.map((e) => reasonChip(e));

  const name = firstName(user.user_metadata?.full_name);

  const ready: ReadyItem[] = data.ready.slice(0, SHOWN).flatMap((e) =>
    e.draft
      ? [
          {
            itemId: e.itemId,

            draftId: e.draft.id,

            name: e.authorName ?? "Someone",

            platform: e.platform,

            where: where(e.platform, e.kind),

            ago: shortAgo(e.receivedAt, now),

            text: e.text,

            media: messageWords(e.text, e.attachments ?? []),

            reply: e.draft.editedBody ?? e.draft.body,

            source: e.draft.facts[0] ?? null,
          },
        ]
      : [],
  );

  const noAccounts = data.accounts.length === 0;

  const nothingWaiting = data.ready.length === 0 && data.onlyYou.length === 0;

  const quietWeek = data.week.answered === 0 && data.week.leads === 0 && data.week.spamHidden === 0;

  const activity =
    nothingWaiting && !noAccounts
      ? await loadTodayActivity(supabase, tenant.id, new Date(), 5, await viewerTimeZone())
      : [];

  // Connected, but nothing has happened yet (approved 16 Nov, state A2): no tiles of zeros.

  const quiet =
    !noAccounts &&
    nothingWaiting &&
    activity.length === 0 &&
    data.answeredOnItsOwn === 0 &&
    data.newLeads.length === 0 &&
    quietWeek;

  const watching = [
    ...new Set(data.accounts.filter((a) => a.working).map((a) => platformLabel(a.platform))),
  ];

  return (
    <main className="mx-auto flex w-full max-w-[1320px] flex-col gap-7 px-4 py-6 md:px-6 md:py-9">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-ink-3 mb-1.5 text-sm">
            <TodayDate />
          </p>

          <h1 className="font-display text-[30px] leading-tight font-semibold tracking-[-0.6px] md:text-[36px]">
            <Greeting name={name} />
          </h1>

          {!noAccounts && (
            <p className="text-ink-2 mt-2 text-base">
              {quiet
                ? "Waggle is ready. Nothing has come in yet."
                : sinceYesterdayLine(data.answeredOnItsOwn, data.newLeads.length)}
            </p>
          )}
        </div>

        {!noAccounts && !quiet && (
          <Link href="/insights/work?period=7" className={buttonVariants({ variant: "secondary" })}>
            See everything Waggle did
          </Link>
        )}
      </div>

      {!noAccounts && <ReadyLine />}

      {/* First connect (approved 19 Nov): what Waggle caught up on, until dismissed. */}
      {!noAccounts && <CatchUpCard />}

      {noAccounts ? (
        // A brand with nothing connected: one clear next step, not a page of zeros.

        <section
          aria-labelledby="setup-title"

          className="card flex flex-wrap items-center gap-x-10 gap-y-5 px-6 py-8 md:px-10"
        >
          <Bee scene="resting" className="-my-2" />

          <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-2">
            <h2 id="setup-title" className="display-title">
              Let&apos;s get Waggle answering
            </h2>

            <p className="text-ink-2">
              Five short steps: your business, where customers message you, your top answers, a few
              practice messages, and how replies go out. Each one can wait. About five minutes.
            </p>

            <div className="mt-2 flex flex-wrap gap-2">
              <Link href="/setup" className={buttonVariants({ variant: "primary" })}>
                Set up Waggle
              </Link>

              <Link href="/settings/accounts" className={buttonVariants({ variant: "secondary" })}>
                Just connect an account
              </Link>
            </div>
          </div>
        </section>
      ) : (
        <>
          {!quiet && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
              <Tile
                href="/contacts/leads"

                chip="New leads"

                tone="bg-success-soft text-success"

                count={data.newLeads.length}

                line={leadsLine(data.newLeads)}
              />

              <Tile
                href="#ready"

                chip="Ready to send"

                tone="bg-honey-tint text-honey-text"

                count={data.ready.length}

                line={
                  data.ready.length
                    ? "Replies Waggle wrote from your answers. Read, tap Send, done."
                    : "Nothing waiting. Waggle sent what it could."
                }

                strong={data.ready.length > 0}
              />

              <Tile
                href="#only-you"

                chip="Only you can answer"

                tone="bg-danger-soft text-danger"

                count={data.onlyYou.length}

                line={onlyYouLine(chips)}
              />
            </div>
          )}

          <div className="flex flex-wrap items-start gap-6">
            <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
              {quiet ? (
                <section
                  aria-labelledby="quiet-title"

                  className="card flex min-w-0 flex-col gap-5 px-6 py-8 md:px-10"
                >
                  <div className="flex flex-wrap items-center gap-x-10 gap-y-4">
                    <Bee scene="caught-up" className="-my-2" />

                    <div className="flex min-w-0 flex-[1_1_260px] flex-col gap-1.5">
                      <h2 id="quiet-title" className="display-title">
                        Nothing needs you yet
                      </h2>

                      <p className="text-ink-2">
                        {watching.length ? `Waggle is watching ${joinNames(watching)}. ` : ""}
                        When a customer writes, their message and Waggle&apos;s reply show up here.
                      </p>
                    </div>
                  </div>

                  <div className="border-line border-t pt-4">
                    <h3 className="text-[13px] font-semibold">What Waggle did today</h3>

                    <p className="text-ink-3 mt-1 text-sm">
                      Quiet so far. Everything Waggle handles today will be listed here.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Link href="/teach#try" className={buttonVariants({ variant: "secondary" })}>
                      Try a pretend message
                    </Link>

                    <Link href="/teach#questions" className={buttonVariants({ variant: "quiet" })}>
                      Add your top answers
                    </Link>
                  </div>
                </section>
              ) : nothingWaiting ? (
                <CaughtUpCard activity={activity} />
              ) : (
                <>
                  {ready.length > 0 && (
                    <ReadyList
                      items={ready}

                      more={Math.max(0, data.ready.length - ready.length)}

                      decide={decideDraft}

                      undo={undoApprovalAction}

                      sendAll={sendAllReadyAction}

                      undoMs={UNDO_WINDOW_MS}

                      replyMax={REPLY_MAX}

                      canSend={canSend}
                    />
                  )}

                  {data.onlyYou.length > 0 && (
                    <section className="card p-6" id="only-you" aria-labelledby="only-you-title">
                      <h2 id="only-you-title" className="section-title">
                        Only you can answer
                      </h2>

                      <p className="text-ink-3 mt-1 text-sm">
                        Waggle never answers these on its own.
                      </p>

                      <ul className="mt-3 flex flex-col">
                        {data.onlyYou.slice(0, SHOWN).map((e, i) => (
                          <li key={e.itemId} className="border-line border-b last:border-b-0">
                            <Link
                              href={`/inbox/items/${e.itemId}`}

                              className="text-ink flex items-center gap-3.5 py-3.5 no-underline"
                            >
                              <PlatformMark platform={e.platform} size={32} />

                              <span className="min-w-0 flex-1">
                                <span className="flex flex-wrap items-center gap-1.5 text-[15px] font-semibold">
                                  {e.authorName ?? "Someone"}

                                  <span
                                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${URGENT_CHIPS.has(chips[i]) ? "bg-danger-soft text-danger" : "bg-subtle text-ink-2"}`}
                                  >
                                    {chips[i]}
                                  </span>
                                </span>

                                <span className="text-ink-2 mt-1 block truncate text-sm">
                                  {e.text.trim()
                                    ? `"${e.text}"`
                                    : messageWords(e.text, e.attachments ?? [])}
                                </span>
                              </span>

                              <span className="text-ink-3 shrink-0 text-[13px]">
                                {shortAgo(e.receivedAt, now)}
                              </span>
                            </Link>
                          </li>
                        ))}
                      </ul>

                      {data.onlyYou.length > SHOWN && (
                        <ActionLink href="/inbox" className="mt-3 inline-flex">
                          See all {data.onlyYou.length} in the Inbox
                        </ActionLink>
                      )}
                    </section>
                  )}
                </>
              )}
            </div>

            <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
              {data.gaps.length > 0 ? (
                <section className="card p-6" aria-labelledby="teach-title">
                  <p className="text-honey-text text-xs font-semibold tracking-wide uppercase">
                    Teach Waggle
                  </p>

                  <h2 id="teach-title" className="section-title mt-1">
                    {`${data.gaps.length} ${data.gaps.length === 1 ? "question" : "questions"} your answers don't cover`}
                  </h2>

                  <ul className="mt-3 flex flex-col gap-2 text-sm">
                    {data.gaps.map((g) => (
                      <li key={g.text} className="bg-subtle rounded-xl px-3 py-2.5">
                        &ldquo;{g.text}&rdquo;
                        {g.times > 1 && (
                          <span className="text-ink-3"> · asked {g.times} times</span>
                        )}
                      </li>
                    ))}
                  </ul>

                  <Link
                    href="/teach#questions"

                    className={`${buttonVariants({ variant: "primary" })} mt-4`}
                  >
                    Write the answers
                  </Link>

                  <p className="meta mt-2">Write it once and Waggle can answer it next time.</p>
                </section>
              ) : (
                <Line
                  href="/teach"

                  title="Teach Waggle"

                  text="Your answers cover what people ask."
                />
              )}

              {quietWeek ? (
                <Line
                  href="/insights/work?period=7"

                  title="This week"

                  text="Nothing yet this week."
                />
              ) : (
                <section className="card p-6" aria-labelledby="week-title">
                  <h2 id="week-title" className="section-title">
                    This week
                  </h2>

                  <div className="mt-3 grid grid-cols-2 gap-4">
                    {[
                      [String(data.week.answered), "messages answered"],

                      [replyTime(data.week.replySeconds), "typical reply time"],

                      [String(data.week.leads), "leads saved"],

                      [String(data.week.spamHidden), "spam comments hidden"],
                    ].map(([n, label]) => (
                      <p key={label} className="flex flex-col">
                        <span className="font-display text-[28px] leading-none font-semibold tabular-nums">
                          {n}
                        </span>

                        <span className="text-ink-3 mt-1 text-[13px]">{label}</span>
                      </p>
                    ))}
                  </div>
                </section>
              )}

              <section className="card p-6" aria-labelledby="accounts-title">
                <h2 id="accounts-title" className="section-title">
                  Your accounts
                </h2>

                <ul className="mt-3 flex flex-col gap-2.5 text-sm">
                  {data.accounts.map((a) => (
                    <li key={a.id} className="flex items-center gap-2.5">
                      <PlatformMark platform={a.platform} size={24} />

                      <span className="flex-1 font-medium">{platformLabel(a.platform)}</span>

                      {a.working ? (
                        <StateLabel state="working">Working</StateLabel>
                      ) : (
                        <span className="inline-flex flex-wrap items-center justify-end gap-3">
                          <StateLabel state="needs">Stopped connecting</StateLabel>

                          <ActionLink href="/settings/accounts">Reconnect</ActionLink>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </section>

              {data.nextPost ? (
                <section className="card p-6" aria-labelledby="next-title">
                  <div className="flex items-center justify-between gap-2">
                    <h2 id="next-title" className="section-title">
                      Next post
                    </h2>

                    <ActionLink href="/posts">Plan posts</ActionLink>
                  </div>

                  <Link href="/posts" className="text-ink mt-3 block no-underline">
                    <b className="block font-semibold">{data.nextPost.title}</b>

                    <span className="text-ink-3 text-[13px]">
                      <LocalWhen iso={data.nextPost.scheduledFor} /> ·{" "}
                      {data.nextPost.platforms === 1
                        ? "1 account"
                        : `${data.nextPost.platforms} accounts`}
                    </span>
                  </Link>
                </section>
              ) : (
                <Line href="/posts" title="Next post" text="Nothing scheduled. Plan one." />
              )}
            </aside>
          </div>
        </>
      )}
    </main>
  );
}

/** A side card with nothing to show: one line, so empty cards don't stretch the page. */

function Line({ href, title, text }: { href: string; title: string; text: string }) {
  return (
    <Link
      href={href}

      className="card text-ink hover:bg-subtle flex items-center gap-3 px-5 py-4 no-underline transition-colors duration-150"
    >
      <span className="min-w-0 flex-1">
        <b className="block text-[15px] font-semibold">{title}</b>

        <span className="text-ink-3 text-sm">{text}</span>
      </span>

      <ArrowRight className="text-ink-3 size-[18px] shrink-0" aria-hidden />
    </Link>
  );
}
