import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "cn";
import { BrandMark, PlatformMark } from "@/components/app/platform-mark";
import { connectAccount } from "@/features/accounts";
import { statusOf, type PlatformStatuses } from "@/features/platforms";
import {
  isConnectable,
  PLATFORM_IDS,
  PLATFORMS,
  platformLabel,
  type PlatformId,
} from "@/lib/social/platforms";
import { connectFirstAccount } from "./actions";
import type { ConnectProblem } from "./first-connect";
import { InAppGate } from "./in-app-gate";
import { SetupStepper } from "./setup-frame";

// Setup step 1, Connect (/welcome; Walter's flow, approved 20 Nov): six places first, Facebook
// and Instagram marked "Best results", Google Ads and X "Coming soon", "See all N platforms".
// Uses the normal connect (SocialProvider through accounts' connectAccount); with no business
// yet, connectFirstAccount makes it first (named later, decision 6).

const FIRST: { id: PlatformId | "googleads"; best?: boolean }[] = [
  { id: "facebook", best: true },
  { id: "instagram", best: true },
  { id: "tiktok" },
  { id: "linkedin" },
  { id: "googleads" },
  { id: "twitter" },
];

/** Platforms that connect through a sign-in and come back here. */
function oauthAvailable(statuses: PlatformStatuses): PlatformId[] {
  return PLATFORM_IDS.filter(
    (id) =>
      isConnectable(id) &&
      PLATFORMS[id].connect === "oauth" &&
      statusOf(statuses, id) === "available",
  );
}

function ConnectTile({
  id,
  best,
  available,
  connected,
  hasBrand,
}: {
  id: string;
  best?: boolean;
  available: boolean;
  connected: boolean;
  hasBrand: boolean;
}) {
  const label = id === "googleads" ? "Google Ads" : id === "twitter" ? "X" : platformLabel(id);
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
        <span className={cn("text-[13px]", connected ? "text-success" : "text-ink-2")}>{line}</span>
      </span>
    </>
  );
  const box = "card flex min-h-[76px] w-full items-center gap-3 px-4 py-3";
  if (!available || connected) {
    return (
      <div className={cn(box, !available && "opacity-60")} aria-disabled={!available || undefined}>
        {inner}
      </div>
    );
  }
  return (
    <form action={hasBrand ? connectAccount : connectFirstAccount}>
      <input type="hidden" name="platform" value={id} />
      <input type="hidden" name="back" value="/welcome" />
      <button
        type="submit"
        aria-label={`Connect ${label}`}
        className={cn(box, "hover:border-honey cursor-pointer transition-colors duration-150")}
      >
        {inner}
      </button>
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
  problem,
  inApp,
  invites,
  email,
}: {
  firstName: string;
  /** On Free: how many accounts it connects (from plan settings); null when not on Free. */
  free: { accounts: number } | null;
  hasBrand: boolean;
  connected: readonly string[];
  statuses: PlatformStatuses;
  /** "See all N platforms" opened. */
  all: boolean;
  problem: ConnectProblem | null;
  inApp: string | null;
  /** Team invites, shown on top (the welcome page's invite list). */
  invites: ReactNode;
  email: string | undefined;
}) {
  const available = new Set(oauthAvailable(statuses));
  const others = [...available].filter((id) => !FIRST.some((f) => f.id === id));
  const tiles = (
    <div className="flex flex-col gap-3">
      <ul className="grid gap-3 sm:grid-cols-2" aria-label="Where to connect">
        {[...FIRST, ...(all ? others.map((id) => ({ id, best: false })) : [])].map((f) => (
          <li key={f.id}>
            <ConnectTile
              id={f.id}
              best={f.best}
              available={f.id !== "googleads" && available.has(f.id as PlatformId)}
              connected={connected.includes(f.id)}
              hasBrand={hasBrand}
            />
          </li>
        ))}
      </ul>
      {others.length > 0 && (
        <Link
          href={all ? "/welcome" : "/welcome?all=1"}
          scroll={false}
          className="action-link self-start text-sm"
        >
          {all ? "Show fewer" : `See all ${available.size} platforms`}
        </Link>
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

        {problem?.kind === "message" && (
          <p
            role="alert"
            className="border-danger-border bg-danger-soft text-danger rounded-xl border p-4 text-sm"
          >
            {problem.text}
          </p>
        )}
        {problem?.kind === "instagram-personal" ? (
          <div className="border-danger-border bg-danger-soft rounded-xl border p-5">
            <h2 className="section-title">This Instagram is a personal account</h2>
            <p className="text-ink-2 mt-1 text-sm">
              Instagram only lets apps read business inboxes. Switching takes about a minute, and
              you keep your posts and followers:
            </p>
            <ol className="text-ink-2 mt-2 list-decimal space-y-1 pl-5 text-sm">
              <li>In Instagram, open Settings → Account type and tools.</li>
              <li>Tap Switch to professional account, then Business.</li>
              <li>Come back here.</li>
            </ol>
            <form action={hasBrand ? connectAccount : connectFirstAccount} className="mt-4">
              <input type="hidden" name="platform" value="instagram" />
              <input type="hidden" name="back" value="/welcome" />
              <button
                type="submit"
                className="bg-honey hover:bg-honey-hover inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold text-[#17140F]"
              >
                I switched, try again
              </button>
            </form>
          </div>
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
        Joining someone&apos;s team instead? Ask them to invite{" "}
        <b className="text-ink font-semibold">{email}</b>. The invite shows up right here.
      </p>
    </>
  );
}
