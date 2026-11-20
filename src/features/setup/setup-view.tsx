import Link from "next/link";
import { redirect } from "next/navigation";
import { connectAccount } from "@/features/accounts";
import { SEND_SPACING_MS } from "@/features/approvals";
import { ReadingInbox } from "@/features/catch-up";
import { can } from "@/features/orgs";
import { getCurrentTenant } from "@/features/tenants";
import { getSocialProvider } from "@/lib/social";
import { platformLabel } from "@/lib/social/platforms";
import { getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { BatchScreen } from "./batch-screen";
import { nameBrandFromProfile } from "./brand-name-server";
import { batchProgress, firstNameOf, plural, replyMeta } from "./copy";
import {
  nextScreen,
  openScreen,
  previousScreen,
  setupEntry,
  stepPosition,
  stepsDone,
  type SetupScreen,
} from "./flow";
import { HowScreen } from "./how-screen";
import { LostDmList } from "./lost-list";
import { NameScreen } from "./name-screen";
import { flowFactsOf, loadSetupData, loadSetupSending, type SetupData } from "./setup-data";
import { PRIMARY, ScreenButton, ScreenFooter, ScreenTitle } from "./setup-frame";
import { SetupFrame } from "./setup-shell";
import { Exchange, SendingCard } from "./setup-parts";
import { restTitle, topicsLine } from "./topics";
import { WaitingScreen } from "./waiting-screen";

// Setup steps 2 and 3 (Walter's flow, one screen at a time; boards approved 20 Nov), on the
// first-connect engine. Step 1 (Connect) is /welcome.

function Tile({ value, label, plain }: { value: string; label: string; plain?: boolean }) {
  return (
    <div className="card flex min-w-0 flex-1 flex-col gap-0.5 px-3 py-2.5">
      <b
        className={`font-display text-[24px] leading-none font-semibold tabular-nums ${plain ? "" : "text-danger"}`}
      >
        {value}
      </b>
      <span className="text-ink-2 text-[12.5px] leading-snug">{label}</span>
    </div>
  );
}

function MissedScreen({ d, firstName }: { d: SetupData; firstName: string }) {
  const m = d.missed;
  const count = m.capped ? `${m.total}+` : String(m.total);
  return (
    <>
      <ScreenTitle
        title={`${firstName}, here’s your last 30 days`}
        sub={
          !d.progress
            ? `Waggle reads the last 30 days on Instagram and Facebook. New ${d.platform} messages land in your Inbox from now on.`
            : m.total === 0
              ? `Every message on ${d.brandName}’s ${d.platform} got a reply. Nice.`
              : `${count} ${m.total === 1 ? "message" : "messages"} got no reply on ${d.brandName}’s ${d.platform}.`
        }
      />
      {d.progress && (
        <div className="flex gap-2">
          <Tile value={String(m.lostDms)} label="DMs you can’t answer anymore" />
          <Tile value={String(m.closeToday)} label="DMs that close today" />
          <Tile
            value={m.capped ? `${m.commentsOpen}+` : String(m.commentsOpen)}
            label="comments with no reply"
          />
        </div>
      )}
      {d.progress?.dmAccessMissing && (
        <p className="text-ink-3 text-sm">
          Waggle couldn’t read your {d.platform} messages, only comments.
        </p>
      )}
      {m.score && (
        <div className="card flex items-center gap-3 px-3 py-2.5">
          <b
            className={`font-display text-[26px] leading-none font-semibold tabular-nums ${m.score.word === "Needs work" ? "text-danger" : m.score.word === "Great" ? "text-success" : ""}`}
          >
            {m.score.score}
            <span className="text-ink-3 text-sm">/100</span>
          </b>
          <span className="text-ink-2 text-[12.5px]">
            <b className="text-ink font-semibold">Response score · {m.score.word}</b>
            <br />
            {m.score.score} of every 100 messages got a reply within 24 hours.
          </span>
        </div>
      )}
    </>
  );
}

function WantedScreen({ d, now }: { d: SetupData; now: Date }) {
  const w = d.wanted;
  return (
    <>
      <ScreenTitle
        title={
          w.count > 0
            ? `${plural(w.count, "person", "people")} wanted to buy or order`
            : "What they wanted"
        }
        sub={w.count > 0 ? "and got no answer." : undefined}
      />
      {w.topics.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="What they asked about">
          {w.topics.map((t) => {
            const hot = t.topic === "order" || t.topic === "price";
            return (
              <li
                key={t.topic}
                className={`bg-surface inline-flex gap-1.5 rounded-full border px-2.5 py-1 text-[12.5px] ${hot ? "border-danger-border text-danger" : "border-line text-ink-2"}`}
              >
                {t.label} <b className="font-semibold tabular-nums">{t.count}</b>
              </li>
            );
          })}
        </ul>
      )}
      {w.lost.length > 0 && (
        <LostDmList lost={w.lost} platform={d.platform} now={now.toISOString()} />
      )}
    </>
  );
}

function RepliesScreen({ d }: { d: SetupData }) {
  const r = d.replies;
  const ex = r.example;
  const parts = [
    r.dmsToday ? plural(r.dmsToday, "DM that closes today", "DMs that close today") : null,
    r.comments ? plural(r.comments, "comment", "comments") : null,
  ].filter(Boolean);
  return (
    <>
      <ScreenTitle
        title={
          r.drafted
            ? `Waggle already wrote ${plural(r.drafted, "reply", "replies")}`
            : "Waggle read every message"
        }
        sub={
          r.drafted ? `For ${parts.join(" and ")}. Nothing is sent yet.` : "Nothing is sent yet."
        }
      />
      {ex && (
        <div className="card">
          <Exchange
            name={ex.author ?? "A customer"}
            meta={replyMeta(ex)}
            metaTone={ex.hoursLeft !== null ? "danger" : "muted"}
            question={ex.text}
            reply={ex.reply}
          />
        </div>
      )}
      {d.waiting.length > 0 && (
        <p className="text-ink-2 text-[13px]">
          <b className="text-danger font-semibold">{d.waiting.length} need you:</b> Waggle didn’t
          have the answer. You’ll answer them next.
        </p>
      )}
      {d.more.length > 0 && (
        <div className="card flex flex-col gap-2 px-3 py-2.5 text-[12.5px]">
          <span>
            <b className="font-semibold">Waggle only checked {d.platform}.</b> Customers may be
            waiting here too:
          </span>
          <span className="flex flex-wrap gap-1.5">
            {d.more.map((p) =>
              p.upgrade ? (
                <Link
                  key={p.platform}
                  href="/setup?screen=replies&upgrade=accounts"
                  scroll={false}
                  className="border-line hover:border-honey text-ink rounded-full border px-2.5 py-1 no-underline"
                >
                  {p.label} +
                </Link>
              ) : (
                <form key={p.platform} action={connectAccount}>
                  <input type="hidden" name="platform" value={p.platform} />
                  <input type="hidden" name="back" value="/setup?screen=replies" />
                  <button
                    type="submit"
                    className="border-line hover:border-honey rounded-full border px-2.5 py-1"
                  >
                    {p.label} +
                  </button>
                </form>
              ),
            )}
          </span>
        </div>
      )}
    </>
  );
}

const NEXT_LABEL: Partial<Record<SetupScreen, string>> = {
  wanted: "Next: what they wanted",
  replies: "Next: Waggle’s replies",
  money: "Check Waggle’s answers",
  quick: "Check Waggle’s answers",
  waiting: "Check Waggle’s answers",
  how: "Next",
};

export async function SetupView({
  requested,
  connecting,
  go = false,
}: {
  requested: string | null;
  connecting?: string;
  /** Past the reading screen while Waggle still sorts (busy accounts). */
  go?: boolean;
}) {
  const tenant = await getCurrentTenant();
  if (!can(tenant.role, "brand.settings")) {
    return (
      <main className="mx-auto w-full max-w-[640px] px-4 py-10">
        <h1 className="page-title">Setting up {tenant.name}</h1>
        <p className="text-ink-2 mt-2">
          An owner or admin sets this up. <Link href="/today">Go to Today</Link>
        </p>
      </main>
    );
  }
  const db = getServiceClient();
  const now = new Date();
  const [user, firstLoad] = await Promise.all([
    getCurrentUser(),
    loadSetupData(db, { tenantId: tenant.id, organizationId: tenant.organizationId, now }),
  ]);
  let d = firstLoad;
  if (setupEntry({ connected: d.connected, connecting: !!connecting }) === "welcome") {
    redirect("/welcome");
  }
  if (
    d.namePending &&
    d.connected &&
    (await nameBrandFromProfile({ db, social: getSocialProvider }, tenant.id))
  ) {
    d = await loadSetupData(db, {
      tenantId: tenant.id,
      organizationId: tenant.organizationId,
      now,
    });
  }
  const firstName = firstNameOf(user.user_metadata?.full_name, user.email);
  const facts = flowFactsOf(d);
  const done = stepsDone({ connected: d.connected, saved: d.savedScreen, finished: d.finished });

  // Signed in, the account is on its way.
  if (!d.connected) {
    return (
      <SetupFrame step={1} done={done} sublabel="Connect">
        <ScreenTitle
          title={`${platformLabel(connecting ?? "")} is connecting`}
          sub="It shows up here in a moment."
        />
        <Link href="/setup" className={`${PRIMARY} self-start no-underline`}>
          Check again
        </Link>
      </SetupFrame>
    );
  }

  const screen = openScreen({ requested, saved: d.savedScreen, facts });
  const pos = stepPosition(screen, facts);
  const sublabel = `${pos.sublabel} · ${pos.index} of ${pos.count}`;
  const after = nextScreen(screen, facts);
  const back = previousScreen(screen, facts);

  // Reading first (existing reading screen), unless the name is asked or the owner went on.
  if (
    screen !== "name" &&
    STEP2.has(screen) &&
    d.progress &&
    d.progress.phase !== "ready" &&
    !go &&
    requested === null
  ) {
    return (
      <SetupFrame step={2} done={done} sublabel="What you missed">
        <ReadingInbox
          initial={d.progress}
          refreshWhenReady
          next={{ href: "/setup?go=1", label: "Show what I missed so far" }}
        />
      </SetupFrame>
    );
  }

  const listed = [...d.batches.money, ...d.batches.rest];
  const meter = { approved: listed.filter((r) => r.approved).length, total: listed.length };
  const sending = batchProgress(await loadSetupSending(db, tenant.id));
  const sendingCard =
    sending.total > 0 ? (
      <SendingCard initial={sending} spacingMs={SEND_SPACING_MS} platform={d.platform} />
    ) : null;
  const nav = { back, index: pos.index, count: pos.count };
  const step: 2 | 3 = pos.step;

  let body: React.ReactNode;
  if (screen === "name") {
    body = <NameScreen platform={d.platform} count={pos.count} />;
  } else if (screen === "money" || screen === "quick") {
    const money = screen === "money";
    const replies = money ? d.batches.money : d.batches.rest;
    body = (
      <BatchScreen
        title={
          money
            ? `${plural(replies.length, "person wants", "people want")} to buy`
            : restTitle(replies)
        }
        sub={money ? "Check my replies and send. Tap one to change it." : topicsLine(replies)}
        replies={replies}
        unchecked={d.unchecked}
        platformWord={d.platform}
        meter={meter}
        top={money ? null : sendingCard}
        next={after ?? "how"}
        {...nav}
        spacingMs={SEND_SPACING_MS}
        canSend={can(tenant.role, "replies.approve")}
      />
    );
  } else if (screen === "waiting") {
    body = (
      <WaitingScreen
        messages={d.waiting}
        meter={meter}
        top={sendingCard}
        next={after ?? "how"}
        {...nav}
      />
    );
  } else if (screen === "how") {
    body = (
      <HowScreen
        topics={d.askFirst}
        mode={d.replyMode}
        autoAllowed={d.autoAllowed}
        top={sendingCard}
        {...nav}
      />
    );
  } else {
    body = (
      <>
        {screen === "missed" && <MissedScreen d={d} firstName={firstName} />}
        {screen === "wanted" && <WantedScreen d={d} now={now} />}
        {screen === "replies" && <RepliesScreen d={d} />}
        <ScreenFooter
          {...nav}
          primary={
            after ? (
              <ScreenButton to={after} className={PRIMARY}>
                {NEXT_LABEL[after] ?? "Next"}
              </ScreenButton>
            ) : null
          }
        />
      </>
    );
  }

  return (
    <SetupFrame step={step} done={done} sublabel={sublabel}>
      {body}
    </SetupFrame>
  );
}

const STEP2 = new Set<SetupScreen>(["missed", "wanted", "replies"]);
