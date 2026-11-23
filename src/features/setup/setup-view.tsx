import Link from "next/link";
import { redirect } from "next/navigation";
import { can } from "@/features/orgs";
import { pullsPastDms } from "@/features/catch-up";
import { getCurrentTenant } from "@/features/tenants";
import { getSocialProvider } from "@/lib/social";
import { platformLabel } from "@/lib/social/platforms";
import { getCurrentUser } from "@/lib/supabase/server";
import { getServiceClient } from "@/lib/supabase/service";
import { nameBrandFromProfile } from "./brand-name-server";
import { upgradeHref } from "@/features/billing";
import { firstNameOf } from "./copy";
import { nextScreen, openScreen, setupEntry, stepPosition, stepsDone } from "./flow";
import { NameScreen } from "./name-screen";
import { SetupChat } from "./setup-chat";
import { flowFactsOf, loadSetupData } from "./setup-data";
import { ReadingProvider, StartingRead } from "./reading-part";
import { Step2Story } from "./step2-story";
import { SetupFrame } from "./setup-shell";
import { PlatformMark } from "@/components/app/platform-mark";
import { ConnectingScreen } from "./connecting-screen";
import { ConnectProblemBox } from "./connect-step-parts";
import type { ConnectProblem } from "./first-connect";

// Setup steps 2 and 3 (Walter's flow, one screen at a time; boards approved 20 Nov), on the
// first-connect engine. Step 1 (Connect) is /welcome.

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

  const screen = openScreen({ requested, saved: d.savedScreen, facts });
  const pos = stepPosition(screen, facts);
  const after = nextScreen(screen, facts);

  // Step 2: the reading, then one Results card (board "Replica update", approved 23 Nov). One
  // screen, "missed"; old links to its parts (wanted, replies) open the results.
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
            lockedSpam={d.missed.lockedSpam}
            closeToday={d.missed.closeToday}
            dmsOpen={d.missed.dmsOpen}
            commentsOpen={d.missed.commentsOpen}
            reviewsOpen={d.missed.reviewsOpen}
            replies={[...d.batches.money, ...d.batches.rest].filter((r) => !r.approved).length}
            needYou={d.waiting.length}
            // Free full: the chip opens the Solo pop-up for that platform on this page.
            more={d.more.map((m) => ({
              platform: m.platform,
              label: m.label,
              upgradeHref: m.upgrade
                ? upgradeHref("accounts", `/setup?platform=${encodeURIComponent(m.platform)}`)
                : null,
            }))}
            days={d.strip}
            now={now.toISOString()}
            into3={after ?? "chat"}
            atResults={requested === "wanted" || requested === "replies"}
          />
        </ReadingProvider>
      </SetupFrame>
    );
  }

  // Step 3 is a conversation with Waggle (board approved 23 Nov): one thread, and its end.
  if (screen === "chat" || (requested === "done" && d.finished)) {
    // Step 2's "Skip for now" finished setup without step 3: the chat is never shown.
    if (d.finished && d.chat.saved.skippedAnswers) redirect("/inbox");
    const saved =
      d.finished && !d.chat.saved.mode ? { ...d.chat.saved, mode: d.replyMode } : d.chat.saved;
    return (
      <SetupFrame step={3} done={done} wayOut={!d.finished}>
        <SetupChat
          firstName={firstName}
          brandName={d.brandName}
          tenantId={tenant.id}
          platformWord={d.platform}
          saved={saved}
          log={d.chat.log}
          kind={d.chat.kind}
          kindWords={d.chat.kindWords}
          facts={d.chat.facts}
          known={d.chat.known}
          answers={d.chat.answers}
          replies={[...d.batches.money, ...d.batches.rest]}
          unchecked={d.unchecked}
          writing={d.replies.writing}
          outOfReplies={d.replies.outOfReplies}
          readBefore={d.readBefore}
          waiting={d.waiting}
          autoAllowed={d.autoAllowed}
          topics={d.askFirst}
          custom={d.askFirstCustom}
          suggested={d.chat.suggested}
          urgent={d.chat.urgent}
          wanted={d.wanted.topics.map((t) => ({ label: t.label, count: t.count, muted: t.muted }))}
          buyers={d.wanted.count}
          finished={d.finished}
          canSend={can(tenant.role, "replies.approve")}
        />
      </SetupFrame>
    );
  }

  const step: 2 | 3 = pos.step;
  const body: React.ReactNode =
    screen === "name" ? <NameScreen platform={d.platform} count={pos.count} /> : null;

  return (
    <SetupFrame step={step} done={done}>
      {/* Each step 3 screen glides in (approved 21 Nov). */}
      <div key={screen} className="part-in flex flex-1 flex-col gap-3.5">
        {body}
      </div>
    </SetupFrame>
  );
}
