import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "cn";
import { BrandMark, PlatformMark } from "@/components/app/platform-mark";
import { StateMark } from "@/components/app/state-mark";
import { connectAccount } from "@/features/accounts";
import { pullsPastDms } from "@/features/catch-up";
import { statusOf, SWITCHABLE, type PlatformStatuses } from "@/features/platforms";
import {
  hasLiveComments,
  isConnectable,
  PLATFORM_IDS,
  PLATFORMS,
  platformLabel,
  type PlatformId,
} from "@/lib/social/platforms";
import { connectFirstAccount } from "./actions";
import { ConnectTileSubmit } from "./connect-pending";
import {
  BEFORE_CONNECT,
  BeforeConnect,
  ConnectProblemBox,
  FreeFullCard,
} from "./connect-step-parts";
import type { ConnectProblem } from "./first-connect";
import { InAppGate } from "./in-app-gate";
import { SetupStepper } from "./setup-frame";

// Setup step 1, Connect (/welcome; Walter's flow, approved 20 Nov): the 4 main places first,
// Facebook and Instagram marked "Best results" (the only ones whose past DMs Zernio replays), then
// "See all N platforms" (board "Connect, step-2 platforms only", v2 approved 21 Nov). Only
// platforms whose last 30 days the first-connect read fills step 2 with are offered; Coming soon
// ones (Staff → Platforms) that would too come last, greyed. The rest (Google reviews, WhatsApp,
// Pinterest…) are connected after setup, in Settings: one quiet line says so. Every card the same
// size.
// Uses the normal connect (SocialProvider through accounts' connectAccount); with no business
// yet, connectFirstAccount makes it first (named later, decision 6).

const MAIN: PlatformId[] = ["facebook", "instagram", "tiktok", "linkedin"];
const BEST = new Set<string>(["facebook", "instagram"]);

/** Platforms that connect through a sign-in and come back here, with their switch. */
function oauthPlatforms(statuses: PlatformStatuses, status: "available" | "soon"): PlatformId[] {
  return PLATFORM_IDS.filter(
    (id) =>
      isConnectable(id) && PLATFORMS[id].connect === "oauth" && statusOf(statuses, id) === status,
  );
}

/** The first-connect read fills step 2 here: past comments, or past DMs (the read's own rule). */
const fillsStepTwo = (id: string): boolean => hasLiveComments(id) || pullsPastDms(id);
/** A Coming soon platform that would fill step 2 once it's on. */
const wouldFillStepTwo = (id: string): boolean =>
  fillsStepTwo(id) || (id in PLATFORMS && PLATFORMS[id as PlatformId].inbox.comments);

/** "X" for twitter; the Staff → Platforms name for the ones Waggle can't connect yet. */
function labelOf(id: string): string {
  if (id === "twitter") return "X";
  if (id in PLATFORMS) return platformLabel(id);
  return SWITCHABLE.find((p) => p.id === id)?.label ?? id;
}

function ConnectTile({
  id,
  label,
  best,
  available,
  connected,
  hasBrand,
}: {
  id: string;
  label: string;
  best?: boolean;
  available: boolean;
  connected: boolean;
  hasBrand: boolean;
}) {
  const line = !available
    ? "Coming soon"
    : connected
      ? "Connected"
      : id in PLATFORMS
        ? PLATFORMS[id as PlatformId].line
        : "";
  const inner = (
    <>
      {id in PLATFORMS ? (
        <PlatformMark platform={id} size={36} />
      ) : (
        <BrandMark brand={id} size={36} />
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <b className="text-[15px] font-semibold">{label}</b>
          {best && available && (
            <span className="border-honey-border bg-honey-tint rounded-full border px-2 text-[11px] font-semibold">
              Best results
            </span>
          )}
        </span>
        {available ? (
          <span className={cn("text-[13px]", connected ? "text-success" : "text-ink-2")}>
            {line}
          </span>
        ) : (
          <span className="text-ink-3 inline-flex items-center gap-1.5 text-[13px]">
            <StateMark state="soon" />
            Coming soon
          </span>
        )}
      </span>
    </>
  );
  // Every card the same size: the grid's rows are equal and each card fills its cell.
  const box = "card flex h-full min-h-[92px] w-full items-center gap-3 px-4 py-3";
  // Coming soon (23 Nov): a dashed card with the dashed hexagon, not a faded one.
  if (!available || connected) {
    return (
      <div
        className={cn(box, !available && "border-line-strong border-dashed shadow-none")}
        aria-disabled={!available || undefined}
      >
        {inner}
      </div>
    );
  }
  const tap = cn(box, "hover:border-honey cursor-pointer transition-colors duration-150");
  // Instagram and Facebook: "Before you connect" first, in place (23 Nov).
  if (BEFORE_CONNECT.has(id)) {
    return (
      <Link
        href={`/welcome?before=${id}`}
        scroll={false}
        aria-label={`Connect ${label}`}
        className={cn(tap, "text-ink no-underline")}
      >
        {inner}
      </Link>
    );
  }
  return (
    <form action={hasBrand ? connectAccount : connectFirstAccount} className="h-full">
      <input type="hidden" name="platform" value={id} />
      <input type="hidden" name="back" value="/welcome" />
      <ConnectTileSubmit platform={label} className={tap}>
        {inner}
      </ConnectTileSubmit>
    </form>
  );
}

export function WelcomeConnect({
  firstName,
  free,
  hasBrand,
  connected,
  statuses,
  all,
  before,
  problem,
  inApp,
  invites,
  email,
}: {
  firstName: string;
  /** On Free: how many accounts it connects (from plan settings); null when not on Free. */
  free: { accounts: number; soloAccounts: number; full: boolean } | null;
  hasBrand: boolean;
  connected: readonly string[];
  statuses: PlatformStatuses;
  /** "See all N platforms" opened. */
  all: boolean;
  /** "Before you connect" open for this platform (Instagram or Facebook). */
  before: string | null;
  problem: ConnectProblem | null;
  inApp: string | null;
  /** Team invites, shown on top (the welcome page's invite list). */
  invites: ReactNode;
  email: string | undefined;
}) {
  const open = oauthPlatforms(statuses, "available");
  const available = open.filter(fillsStepTwo);
  const soon = SWITCHABLE.filter(
    (p) => statusOf(statuses, p.id) === "soon" && wouldFillStepTwo(p.id),
  ).map((p) => p.id);
  const main = MAIN.filter((id) => available.includes(id));
  const others = available.filter((id) => !MAIN.includes(id));
  const later = open.filter((id) => !fillsStepTwo(id));
  const total = available.length + soon.length;
  const shown: { id: string; available: boolean }[] = [
    ...main.map((id) => ({ id, available: true })),
    ...(all
      ? [
          ...others.map((id) => ({ id, available: true })),
          ...soon.map((id) => ({ id, available: false })),
        ]
      : []),
  ];
  const laterNames = later.slice(0, 3).map(labelOf);
  const beforeOpen =
    before &&
    BEFORE_CONNECT.has(before) &&
    main.includes(before as PlatformId) &&
    !connected.includes(before)
      ? before
      : null;
  const tiles = (
    <div className="flex flex-col gap-3">
      <ul className="grid auto-rows-fr gap-3 sm:grid-cols-2" aria-label="Where to connect">
        {shown.map((f) => (
          <li key={f.id}>
            <ConnectTile
              id={f.id}
              label={labelOf(f.id)}
              best={BEST.has(f.id)}
              available={f.available}
              connected={connected.includes(f.id)}
              hasBrand={hasBrand}
            />
          </li>
        ))}
      </ul>
      {total > main.length && (
        <Link
          href={all ? "/welcome" : "/welcome?all=1"}
          scroll={false}
          className="action-link self-start text-sm"
        >
          {all ? "Show fewer" : `See all ${total} platforms`}
        </Link>
      )}
      {later.length > 0 && (
        <p className="bg-subtle text-ink-2 flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13px]">
          <span className="flex shrink-0 gap-1">
            {later.slice(0, 3).map((id) => (
              <PlatformMark key={id} platform={id} size={22} />
            ))}
          </span>
          <span>
            {laterNames.join(", ")}
            {later.length > 3 ? " and more" : ""}: connect them after setup, in Settings.
          </span>
        </p>
      )}
    </div>
  );

  return (
    <>
      {invites}
      <div className="flex flex-col gap-1.5">
        <SetupStepper current={1} done={[false, false, false]} />
        <span className="text-ink-3 text-[12.5px]">Before you start</span>
      </div>
      <section aria-labelledby="connect-title" className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <h1 id="connect-title" className="page-title">
            {free
              ? `Welcome, ${firstName}. Connect one account for free`
              : `Welcome, ${firstName}. Connect your accounts`}
          </h1>
          <p className="text-ink-2 text-[15px]">
            Pick where your customers message you most. Waggle shows you what you missed in the last
            30 days, then helps you answer.
          </p>
        </div>

        {problem && problem.kind !== "free-full" && (
          <ConnectProblemBox problem={problem} hasBrand={hasBrand} />
        )}
        {free && (free.full || problem?.kind === "free-full") ? (
          <FreeFullCard accounts={free.accounts} soloAccounts={free.soloAccounts} />
        ) : problem?.kind === "instagram-personal" ? null : beforeOpen ? (
          <BeforeConnect platform={beforeOpen} hasBrand={hasBrand} />
        ) : inApp ? (
          <InAppGate app={inApp}>{tiles}</InAppGate>
        ) : (
          tiles
        )}

        <p className="text-ink-2 text-sm">
          {free
            ? `Free connects ${free.accounts === 1 ? "1 account" : `${free.accounts} accounts`}. `
            : ""}
          Waggle reads the last 30 days to show you what you missed. Nothing is sent without your
          OK.
        </p>
      </section>
      <p className="border-line text-ink-2 border-t pt-4 text-sm">
        Joining someone&apos;s business instead? Ask them to invite{" "}
        <b className="text-ink font-semibold">{email}</b>. The invite shows up right here.
      </p>
    </>
  );
}
