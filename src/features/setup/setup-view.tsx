import Link from "next/link";
import { redirect } from "next/navigation";
import { SEND_SPACING_MS } from "@/features/approvals";
import { can } from "@/features/orgs";
import { pullsPastDms } from "@/features/catch-up";
import { getCurrentTenant } from "@/features/tenants";
import { getSocialProvider } from "@/lib/social";
import { platformLabel } from "@/lib/social/platforms";
import { getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { BatchScreen } from "./batch-screen";
import { nameBrandFromProfile } from "./brand-name-server";
import { ageLabel, batchProgress, doneLines, firstNameOf, plural } from "./copy";
import {
  nextScreen,
  openScreen,
  previousScreen,
  setupEntry,
  stepPosition,
  stepsDone,
} from "./flow";
import { HowScreen } from "./how-screen";
import { DoneScreen } from "./done-screen";
import { NameScreen } from "./name-screen";
import { flowFactsOf, loadSetupData, loadSetupSending, type SetupData } from "./setup-data";
import { ReadingProvider, StartingRead } from "./reading-part";
import { Step2Story, type StoryChat } from "./step2-story";
import { SetupFrame } from "./setup-shell";
import { SendingCard } from "./setup-parts";
import { restTitle, topicsLine } from "./topics";
import { WaitingScreen } from "./waiting-screen";
import { PlatformMark } from "@/components/app/platform-mark";
import { ConnectingScreen } from "./connecting-screen";
import { ConnectProblemBox } from "./connect-step-parts";
import type { ConnectProblem } from "./first-connect";

// Setup steps 2 and 3 (Walter's flow, one screen at a time; boards approved 20 Nov), on the
// first-connect engine. Step 1 (Connect) is /welcome.

/** Step 2's chat rows (board "Step 2 plays like a story"): replies still to send, else lost DMs. */
function storyChats(d: SetupData, now: Date): StoryChat[] {
  const open = [...d.batches.money, ...d.batches.rest].filter((r) => !r.approved).slice(0, 2);
  if (open.length > 0) {
    return open.map((r) => ({
      key: r.itemId,
      name: r.author ?? "A customer",
      dm: r.kind === "dm",
      meta:
        r.kind === "dm"
          ? r.hoursLeft !== null
            ? `DM · closes in ${r.hoursLeft} h`
            : "DM"
          : `comment · ${ageLabel(r.receivedAt, now)}`,
      urgent: r.kind === "dm" && r.hoursLeft !== null,
      text: r.text,
    }));
  }
  // Spam isn't shown as an example of someone waiting.
  return d.wanted.lost
    .filter((l) => l.topic !== "spam")
    .slice(0, 2)
    .map((l) => ({
      key: l.key,
      name: l.name,
      dm: true,
      meta: `DM · ${ageLabel(l.receivedAt, now)}`,
      urgent: false,
      text: l.text,
    }));
}

export async function SetupView({
  requested,
  connecting,
  problem = null,
}: {
  requested: string | null;
  connecting?: string;
  /** What a failed first connect came back with (23 Nov): said on the connecting screen. */
  problem?: ConnectProblem | null;
  /** Old links' "past the reading screen" (step 2 now reads in place): ignored. */
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
  const sendingLoad = loadSetupSending(db, tenant.id);
  sendingLoad.catch(() => undefined); // awaited below on step 3; not an unhandled rejection
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

  // Signed in, the account is on its way (board "Setup, start to finish", approved 23 Nov): the
  // connecting screen checks by itself and opens step 2; a failed sign-in says why in place.
  if (!d.connected) {
    const platform = connecting ?? "";
    return (
      <SetupFrame step={1} done={done}>
        {/* Free's "accounts used" only comes back to /welcome, never here. */}
        {problem && problem.kind !== "free-full" ? (
          <ConnectProblemBox problem={problem} hasBrand />
        ) : (
          <ConnectingScreen
            label={platformLabel(platform)}
            mark={<PlatformMark platform={platform} size={44} />}
          />
        )}
      </SetupFrame>
    );
  }

  // The end (board "Setup, start to finish", 23 Nov): Finish setup lands here, in the frame.
  if (requested === "done" && d.finished) {
    const sent = batchProgress(await sendingLoad);
    return (
      <SetupFrame step={3} done={done} wayOut={false}>
        <DoneScreen
          firstName={firstName}
          lines={doneLines({
            platforms: d.connectedPlatforms,
            sending: sent,
            mode: d.replyMode,
            waiting: d.waiting,
          })}
        />
      </SetupFrame>
    );
  }

  const screen = openScreen({ requested, saved: d.savedScreen, facts });
  const pos = stepPosition(screen, facts);
  const after = nextScreen(screen, facts);
  const back = previousScreen(screen, facts);

  // Step 2 plays like a story, then shows everything (board approved 23 Nov). One screen,
  // "missed"; old links to its parts (wanted, replies) open the summary.
  if (screen === "missed") {
    const p = d.progress;
    const handle = p?.handle ? `@${p.handle.replace(/^@/, "")}` : d.platform;
    // Connected moments ago, its read on its way: show reading and look again until it starts.
    if (!p && d.startingRead) {
      return (
        <SetupFrame step={2} done={done}>
          <StartingRead handle={d.platform} days={d.strip} now={now.toISOString()} />
        </SetupFrame>
      );
    }
    return (
      <SetupFrame step={2} done={done}>
        {/* Around the story: the reading goes on whichever scene shows. */}
        <ReadingProvider initial={p} days={d.strip}>
          <Step2Story
            firstName={firstName}
            brandName={d.brandName}
            platform={d.platform}
            handle={handle}
            progress={p}
            readBefore={d.readBefore}
            pastDms={!!p && pullsPastDms(p.platform)}
            dmAccessMissing={p?.dmAccessMissing ?? false}
            locked={d.missed.lostDms}
            closeToday={d.missed.closeToday}
            dmsOpen={d.missed.dmsOpen}
            commentsOpen={d.missed.commentsOpen}
            topics={d.wanted.topics.map((t) => ({
              label: t.label,
              count: t.count,
              muted: t.muted,
            }))}
            chats={storyChats(d, now)}
            drafted={d.replies.drafted}
            needYou={d.waiting.length}
            writing={d.replies.writing}
            outOfReplies={d.replies.outOfReplies}
            nothingToAnswer={
              d.replies.drafted === 0 && d.waiting.length === 0 && d.replies.writing.of === 0
            }
            quiet={!!p && p.commentsFound + p.messagesFound === 0 && d.missed.total === 0}
            days={d.strip}
            now={now.toISOString()}
            into3={after ?? "how"}
            atSummary={requested === "wanted" || requested === "replies"}
          />
        </ReadingProvider>
      </SetupFrame>
    );
  }

  const listed = [...d.batches.money, ...d.batches.rest];
  const meter = { approved: listed.filter((r) => r.approved).length, total: listed.length };
  const sending = batchProgress(await sendingLoad);
  const sendingCard =
    sending.total > 0 ? (
      <SendingCard initial={sending} spacingMs={SEND_SPACING_MS} platform={d.platform} />
    ) : null;
  const nav = { back, index: pos.index, count: pos.count };
  const step: 2 | 3 = pos.step;

  let body: React.ReactNode = null;
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
        sub={money ? "Untick any you’d rather not send." : topicsLine(replies)}
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
        custom={d.askFirstCustom}
        mode={d.replyMode}
        autoAllowed={d.autoAllowed}
        top={sendingCard}
        {...nav}
      />
    );
  }

  return (
    <SetupFrame step={step} done={done}>
      {/* Each step 3 screen glides in (approved 21 Nov). */}
      <div key={screen} className="part-in flex flex-1 flex-col gap-3.5">
        {body}
      </div>
    </SetupFrame>
  );
}
