import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PlatformMark } from "@/components/app/platform-mark";
import { buttonVariants } from "@/components/ui/button";
import {
  decideDraft,
  messageWords,
  reasonChip,
  REPLY_MAX,
  sendAllReadyAction,
  undoApprovalAction,
  UNDO_WINDOW_MS,
  URGENT_CHIPS,
} from "@/features/approvals";
import { can } from "@/features/orgs";
import { getCurrentTenant } from "@/features/tenants";
import { platformLabel } from "@/lib/social/platforms";
import { createServerSupabase, getCurrentUser } from "@/lib/supabase/server";
import { loadToday } from "./data";
import { Greeting, LocalWhen, TodayDate } from "./greeting";
import { ReadyList, type ReadyItem } from "./ready-list";
import {
  firstName,
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
          <p className="text-ink-2 mt-2 text-base">
            {sinceYesterdayLine(data.answeredOnItsOwn, data.newLeads.length)}
          </p>
        </div>
        <Link
          href="/analytics?section=work&period=7"
          className={buttonVariants({ variant: "secondary" })}
        >
          See everything Waggle did
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
        <Tile
          href="/leads"
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

      <div className="flex flex-wrap items-start gap-6">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-6">
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
          <section className="card p-6" id="only-you" aria-labelledby="only-you-title">
            <h2 id="only-you-title" className="section-title">
              Only you can answer
            </h2>
            <p className="text-ink-3 mt-1 text-sm">Waggle never answers these on its own.</p>
            {data.onlyYou.length ? (
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
            ) : (
              <p className="text-ink-2 mt-3 text-sm">Nothing needs you right now.</p>
            )}
            {data.onlyYou.length > SHOWN && (
              <Link href="/inbox" className="text-honey-text mt-2 inline-block text-sm underline">
                See all {data.onlyYou.length} in the Inbox
              </Link>
            )}
          </section>
        </div>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-6">
          <section className="card p-6" aria-labelledby="teach-title">
            <p className="text-honey-text text-xs font-semibold tracking-wide uppercase">
              Teach Waggle
            </p>
            <h2 id="teach-title" className="section-title mt-1">
              {data.gaps.length
                ? `${data.gaps.length} ${data.gaps.length === 1 ? "question" : "questions"} your answers don't cover`
                : "Your answers cover what people ask"}
            </h2>
            {data.gaps.length > 0 && (
              <>
                <ul className="mt-3 flex flex-col gap-2 text-sm">
                  {data.gaps.map((g) => (
                    <li key={g.text} className="bg-subtle rounded-xl px-3 py-2.5">
                      &ldquo;{g.text}&rdquo;
                      {g.times > 1 && <span className="text-ink-3"> · asked {g.times} times</span>}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/knowledge-base"
                  className={`${buttonVariants({ variant: "primary" })} mt-4`}
                >
                  Write the answers
                </Link>
                <p className="meta mt-2">Write it once and Waggle can answer it next time.</p>
              </>
            )}
          </section>

          <section className="card p-6" aria-labelledby="week-title">
            <h2 id="week-title" className="section-title">
              This week
            </h2>
            <dl className="mt-3 grid grid-cols-2 gap-4">
              {[
                [String(data.week.answered), "messages answered"],
                [replyTime(data.week.replySeconds), "typical reply time"],
                [String(data.week.leads), "leads saved"],
                [String(data.week.spamHidden), "spam comments hidden"],
              ].map(([n, label]) => (
                <div key={label}>
                  <dt className="sr-only">{label}</dt>
                  <dd className="font-display text-[28px] leading-none font-semibold tabular-nums">
                    {n}
                  </dd>
                  <dd className="text-ink-3 mt-1 text-[13px]">{label}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="card p-6" aria-labelledby="accounts-title">
            <h2 id="accounts-title" className="section-title">
              Your accounts
            </h2>
            {data.accounts.length ? (
              <ul className="mt-3 flex flex-col gap-2.5 text-sm">
                {data.accounts.map((a) => (
                  <li key={a.id} className="flex items-center gap-2.5">
                    <PlatformMark platform={a.platform} size={24} />
                    <span className="flex-1 font-medium">{platformLabel(a.platform)}</span>
                    {a.working ? (
                      <span className="text-success font-semibold">Working</span>
                    ) : (
                      <Link
                        href="/settings?section=accounts"
                        className="text-danger font-semibold underline"
                      >
                        Needs reconnecting
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ink-2 mt-3 text-sm">
                <Link href="/settings?section=accounts" className="underline">
                  Connect your first account
                </Link>{" "}
                so Waggle can answer there.
              </p>
            )}
          </section>

          <section className="card p-6" aria-labelledby="next-title">
            <div className="flex items-center justify-between gap-2">
              <h2 id="next-title" className="section-title">
                Next post
              </h2>
              <Link href="/posts" className="text-honey-text text-sm font-medium underline">
                Plan posts
              </Link>
            </div>
            {data.nextPost ? (
              <Link href="/posts" className="text-ink mt-3 block no-underline">
                <b className="block font-semibold">{data.nextPost.title}</b>
                <span className="text-ink-3 text-[13px]">
                  <LocalWhen iso={data.nextPost.scheduledFor} /> ·{" "}
                  {data.nextPost.platforms === 1
                    ? "1 account"
                    : `${data.nextPost.platforms} accounts`}
                </span>
              </Link>
            ) : (
              <p className="text-ink-2 mt-3 text-sm">Nothing scheduled yet.</p>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
