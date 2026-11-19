import Link from "next/link";
import { ActionLink } from "@/components/app/action-link";
import { Bee } from "@/components/app/bee";
import { EmptySpot } from "@/components/app/empty-spot";
import { buttonVariants } from "@/components/ui/button";
import { getCurrentTenant } from "@/features/tenants";
import { platformLabel } from "@/lib/social/platforms";
import { createServerSupabase } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import {
  atHandle,
  breakdownChips,
  draftsLine,
  expiringTitle,
  formatCount,
  missedTitle,
  notCountedLine,
  revealState,
  waitingFor,
} from "./first-connect-copy";
import { ReadingInbox } from "./reading-inbox";
import { AlreadyHandled, CountdownPill, MarkSeen } from "./reveal-parts";
import { loadCatchUpProgress, loadReveal } from "./reveal-data";

const SHOWN_EXPIRING = 2;

function SwitchLine({ handle }: { handle: string }) {
  return (
    <>
      Connected {handle} · Not the right account?{" "}
      <Link href="/settings/accounts" className="link-inline">
        Switch
      </Link>
    </>
  );
}

/**
 * "Here's what you've been missing" (canvas board approved 20 Nov): one big number, what they
 * wanted, the longest wait, what expires today, one button. Quiet accounts are "all caught up"
 * (never "0 missed"); with no answers written, one step to the first replies.
 */
export async function RevealView() {
  const tenant = await getCurrentTenant();
  const service = getServiceClient();
  const supabase = await createServerSupabase();
  const [data, { data: kb, count: answers }] = await Promise.all([
    loadReveal(service, tenant.id),
    supabase
      .from("kb_entries")
      .select("title, content", { count: "exact" })
      .eq("tenant_id", tenant.id)
      .order("created_at", { ascending: true })
      .limit(1),
  ]);
  const state = revealState(data, answers ?? 0);

  if (state === "none") {
    // Before the reveal has anything: the live counters if a catch-up is running.
    const progress = await loadCatchUpProgress(service, tenant.id);
    if (progress) {
      return (
        <main className="mx-auto flex w-full max-w-[760px] flex-col gap-7 px-4 py-8 md:py-12">
          <ReadingInbox initial={progress} refreshWhenReady />
        </main>
      );
    }
    return (
      <main className="mx-auto flex w-full max-w-[760px] flex-col gap-5 px-4 py-8 md:py-12">
        <h1 className="page-title">Here’s what you’ve been missing</h1>
        <div className="card p-5">
          <EmptySpot
            action={
              <Link href="/setup?step=2" className={buttonVariants({ variant: "primary" })}>
                Connect an account
              </Link>
            }
          >
            Connect Instagram or Facebook and we’ll show you who’s been waiting.
          </EmptySpot>
        </div>
      </main>
    );
  }

  // Narrowed by revealState: only "none" has no data.
  const d = data!;
  const p = d.progress;
  const platform = platformLabel(p.platform);
  const handle = atHandle(p.handle, platform);

  if (state === "reading") {
    return (
      <main className="mx-auto flex w-full max-w-[760px] flex-col gap-7 px-4 py-8 md:py-12">
        <ReadingInbox initial={p} refreshWhenReady />
      </main>
    );
  }

  if (state === "quiet") {
    const sample = kb?.[0];
    return (
      <main className="mx-auto flex w-full max-w-[760px] flex-col gap-5 px-4 py-8 md:py-12">
        <MarkSeen catchUpId={p.catchUpId} />
        <section className="card flex flex-col items-center gap-3 px-6 py-8 text-center">
          <Bee scene="resting" />
          <h1 className="page-title">You’re all caught up</h1>
          <p className="text-ink-2 max-w-[520px]">
            Nobody’s waiting on {handle} right now. Waggle is watching from now on, and drafts a
            reply the moment someone asks.
          </p>
        </section>
        {sample && (
          <section className="card flex flex-col gap-3 p-5" aria-labelledby="sample-title">
            <h2 id="sample-title" className="label tracking-wide uppercase">
              Here’s how a reply will look
            </h2>
            <p className="bg-subtle self-start rounded-xl px-3.5 py-2 text-[15px]">
              “{sample.title}”
            </p>
            <p className="border-honey-border bg-honey-tint self-end rounded-xl border px-3.5 py-2 text-[15px] whitespace-pre-line">
              {sample.content}
            </p>
            <p className="meta">A sample from your answers. Nothing was sent.</p>
          </section>
        )}
        <Link href="/today" className={`${buttonVariants({ variant: "primary" })} self-start`}>
          Go to Today
        </Link>
      </main>
    );
  }

  const waiting = formatCount(d.waiting, { capped: p.capped, sorted: true });

  if (state === "no-answers") {
    return (
      <main className="mx-auto flex w-full max-w-[760px] flex-col gap-5 px-4 py-8 md:py-12">
        <section className="card flex flex-col gap-3 p-6">
          <h1 className="page-title">
            {waiting} {d.waiting === 1 ? "customer" : "customers"} waited for a reply
          </h1>
          <p className="text-ink-2">
            Waggle replies only with your answers, and you haven’t written any yet. Answer your top
            question and the first replies are ready in a minute.
          </p>
          <Link
            href="/setup?step=3"
            className={`${buttonVariants({ variant: "primary" })} self-start`}
          >
            Answer 1 question to get your first replies ready
          </Link>
        </section>
      </main>
    );
  }

  const chips = breakdownChips(d.breakdown);
  const notCounted = notCountedLine(d.notCounted);
  const wait = d.longestWait;
  const expiring = d.expiringToday;

  return (
    <main className="mx-auto flex w-full max-w-[760px] flex-col gap-5 px-4 pt-8 pb-28 md:py-12">
      <MarkSeen catchUpId={p.catchUpId} />
      <section className="flex flex-col gap-3" aria-labelledby="reveal-title">
        <p className="text-honey-text text-xs font-bold tracking-[0.08em] uppercase">
          Here’s what you’ve been missing
        </p>
        <h1 id="reveal-title" className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-display text-[64px] leading-none font-semibold tracking-[-1.5px] tabular-nums md:text-[80px]">
            {waiting}
          </span>
          <span className="font-display text-[22px] leading-tight font-semibold">
            {d.waiting === 1 ? "customer" : "customers"} waited for a reply in the last 30 days
          </span>
        </h1>
        <p className="text-ink-2 text-sm">
          Questions, leads and complaints only.{notCounted ? ` ${notCounted}` : ""}{" "}
          <SwitchLine handle={handle} />
        </p>
        {chips.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="What they wanted">
            {chips.map((c) => (
              <li
                key={c}
                className="bg-surface border-line text-ink-2 inline-flex min-h-8 items-center rounded-full border px-3 text-[13px] font-semibold"
              >
                {c}
              </li>
            ))}
          </ul>
        )}
      </section>

      {wait && (
        <section className="card flex flex-col gap-2 p-5" aria-labelledby="wait-title">
          <p className="label tracking-wide uppercase">The longest wait · a comment</p>
          <h2 id="wait-title" className="section-title">
            {atHandle(wait.handle, platform)} {waitingFor(wait.daysWaiting)}
          </h2>
          <p className="bg-subtle self-start rounded-xl px-3.5 py-2 text-[15px]">“{wait.text}”</p>
          <p className="text-ink-3 text-sm">
            {wait.postLabel ? `On your post ${wait.postLabel}.` : "On one of your posts."} Comments
            can be answered at any age.
          </p>
          <AlreadyHandled itemId={wait.itemId} />
        </section>
      )}

      {expiring.length > 0 && (
        <section className="card flex flex-col gap-3 p-5" aria-labelledby="expiring-title">
          <div>
            <h2 id="expiring-title" className="section-title">
              {expiringTitle(expiring.length)}
            </h2>
            <p className="text-ink-2 text-sm">
              {platform} lets you answer a message for 24 hours. These go first.
            </p>
          </div>
          <ul className="divide-line flex flex-col divide-y">
            {expiring.slice(0, SHOWN_EXPIRING).map((m) => (
              <li key={m.itemId} className="flex items-center gap-3 py-2.5">
                <span className="flex min-w-0 flex-1 flex-col">
                  <b className="text-sm font-semibold">{atHandle(m.handle, platform)}</b>
                  <span className="text-ink-2 truncate text-sm">{m.text}</span>
                </span>
                <CountdownPill expiresAt={m.expiresAt} />
              </li>
            ))}
          </ul>
          {expiring.length > SHOWN_EXPIRING && (
            <p className="meta">+ {expiring.length - SHOWN_EXPIRING} more</p>
          )}
        </section>
      )}

      {/* Phone: the button sits at the bottom, where the thumb rests (board "Phone"). */}
      <div className="bg-page border-line fixed inset-x-0 bottom-0 z-10 flex flex-col gap-1.5 border-t px-4 py-3 md:static md:border-0 md:p-0">
        {d.draftsReady > 0 ? (
          <>
            <Link
              href="/inbox"
              className={`${buttonVariants({ variant: "primary" })} md:self-start`}
            >
              Approve your first replies
            </Link>
            <p className="meta text-center md:text-left">{draftsLine(d.draftsReady)}</p>
          </>
        ) : (
          <Link href="/inbox" className={`${buttonVariants({ variant: "primary" })} md:self-start`}>
            See who’s waiting
          </Link>
        )}
      </div>

      {d.missed > 0 && (
        <section
          className="card bg-subtle flex flex-col gap-2 p-5 opacity-80"
          aria-labelledby="missed-title"
        >
          <h2 id="missed-title" className="section-title text-ink-2">
            {missedTitle(d.missed)}
          </h2>
          <p className="text-ink-3 text-sm">
            These are past {platform}’s 24-hour window, so they can’t be answered here. From now on,
            Waggle drafts every new message as it arrives.
          </p>
          <ActionLink href="/inbox/missed" className="self-start">
            See them (read only)
          </ActionLink>
        </section>
      )}
    </main>
  );
}
