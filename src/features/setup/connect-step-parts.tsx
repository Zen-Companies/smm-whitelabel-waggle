import Link from "next/link";
import { BeeBody } from "@/components/app/bee";
import { StateMark } from "@/components/app/state-mark";
import { buttonVariants } from "@/components/ui/button";
import { connectAccount, ConnectTrouble } from "@/features/accounts";
import { upgradeHref } from "@/features/billing";
import { platformLabel } from "@/lib/social/platforms";
import { connectFirstAccount } from "./actions";
import { ConnectSubmit } from "./connect-pending";
import type { ConnectProblem } from "./first-connect";
import { switchSteps } from "./connect-help";
import { PRIMARY, QUIET } from "./setup-frame";
import { OkLine, PROGRESS_SAVED, StepRow } from "./step-drawings";

// Setup step 1's states around leaving for a sign-in (board "Setup, start to finish", approved
// 23 Nov): "Before you connect", what came back wrong, and Free with its account used.

/** Instagram and Facebook: where a personal account fails, so Waggle says what to sign in with. */
export const BEFORE_CONNECT = new Set<string>(["instagram", "facebook"]);

function Bee({ width = 30 }: { width?: number }) {
  return (
    <svg width={width} height={Math.round((width * 16) / 24)} viewBox="0 0 24 16" aria-hidden>
      <BeeBody />
    </svg>
  );
}

/** A form that starts the connect: the normal one, or the first one that makes the brand. */
function ConnectForm({
  platform,
  hasBrand,
  children,
  className,
}: {
  platform: string;
  hasBrand: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <form action={hasBrand ? connectAccount : connectFirstAccount} className={className}>
      <input type="hidden" name="platform" value={platform} />
      <input type="hidden" name="back" value="/welcome" />
      {children}
    </form>
  );
}

/** "Before you connect Instagram": two checks, then Continue (it shows the bee while it goes). */
export function BeforeConnect({ platform, hasBrand }: { platform: string; hasBrand: boolean }) {
  const label = platformLabel(platform);
  return (
    <section aria-labelledby="before-connect-title" className="card flex flex-col gap-4 p-5 md:p-6">
      <span className="bee-bob self-center">
        <Bee width={44} />
      </span>
      <h2 id="before-connect-title" className="font-display text-[22px] font-semibold">
        Before you connect {label}
      </h2>
      <ul className="border-line bg-surface flex flex-col gap-2 rounded-xl border px-4 py-3 text-sm">
        <li className="flex items-center gap-2">
          <StateMark state="working" />
          <span>
            Use a <b className="font-semibold">business or creator</b> account
          </span>
        </li>
        <li className="flex items-center gap-2">
          <StateMark state="working" />
          <span>Log in to your business’s {label}, the one customers message</span>
        </li>
      </ul>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Link href="/welcome" scroll={false} className="action-link text-sm">
          Pick another
        </Link>
        <ConnectForm platform={platform} hasBrand={hasBrand}>
          <ConnectSubmit platform={label} className={PRIMARY}>
            Continue to {label}
          </ConnectSubmit>
        </ConnectForm>
      </div>
      <ConnectTrouble className="self-start" />
    </section>
  );
}

/** Free with its accounts used: Solo in place, not a trip to the plan page. */
export function FreeFullCard({
  accounts,
  soloAccounts,
}: {
  accounts: number;
  soloAccounts: number;
}) {
  const n = (k: number) => (k === 1 ? "1 account" : `${k} accounts`);
  return (
    <div role="status" className="card flex flex-wrap items-center gap-3 px-4 py-3">
      <Bee />
      <p className="min-w-[200px] flex-1 text-sm">
        <b className="font-semibold">Free connects {n(accounts)}.</b> Solo connects{" "}
        {n(soloAccounts)}.
      </p>
      <Link
        href={upgradeHref("accounts", "/welcome")}
        scroll={false}
        className={buttonVariants({ variant: "secondary" })}
      >
        See Solo
      </Link>
    </div>
  );
}

/**
 * What came back from the sign-in, in place: a personal Instagram (switch it, try again, or pick
 * another), a cancelled sign-in (try again), or the connect banner's words.
 */
export function ConnectProblemBox({
  problem,
  hasBrand,
}: {
  problem: Exclude<ConnectProblem, { kind: "free-full" }>;
  hasBrand: boolean;
}) {
  if (problem.kind === "message") {
    return (
      <p
        role="alert"
        className="border-danger-border bg-danger-soft text-danger rounded-xl border p-4 text-sm"
      >
        {problem.text}
      </p>
    );
  }
  if (problem.kind === "cancelled") {
    const label = platformLabel(problem.platform);
    return (
      <section role="alert" className="card flex flex-col gap-3 p-5">
        <h2 className="font-display text-[20px] font-semibold">{label} sign-in was cancelled</h2>
        <ConnectForm platform={problem.platform} hasBrand={hasBrand} className="self-start">
          <ConnectSubmit platform={label} className={PRIMARY}>
            Try again
          </ConnectSubmit>
        </ConnectForm>
      </section>
    );
  }
  // Connect fix 2 (approved 24 Nov): the switch steps already open, only Instagram's (we know
  // which one failed); one primary, "I switched, try again"; free, posts kept, progress saved.
  return (
    <section aria-labelledby="personal-title" className="flex flex-col gap-3">
      <div
        role="alert"
        className="border-danger-border bg-danger-soft flex flex-col gap-3 rounded-xl border p-4"
      >
        <div className="flex flex-col gap-1">
          <h2 id="personal-title" className="text-danger text-[15px] font-semibold">
            That’s a personal Instagram
          </h2>
          <p className="text-ink text-sm">
            Waggle needs a business or creator account. Switching is free and takes 30 seconds. Your
            posts and followers stay the same.
          </p>
        </div>
        <div className="bg-surface rounded-xl p-3">
          <StepRow
            steps={switchSteps("instagram")}
            label="How to switch Instagram to business or creator"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Link href="/welcome" className={QUIET}>
          Connect another account
        </Link>
        <ConnectForm platform="instagram" hasBrand={hasBrand}>
          <ConnectSubmit platform="Instagram" className={PRIMARY}>
            I switched, try again
          </ConnectSubmit>
        </ConnectForm>
      </div>
      <OkLine>{PROGRESS_SAVED}</OkLine>
    </section>
  );
}

/** The "I switched, connect …" button under the switch steps (a connect form, made here). */
export function SwitchedConnect({
  platform,
  hasBrand,
}: {
  platform: "instagram" | "facebook";
  hasBrand: boolean;
}) {
  const label = platformLabel(platform);
  return (
    <ConnectForm platform={platform} hasBrand={hasBrand}>
      <ConnectSubmit platform={label} className={PRIMARY}>
        {platform === "facebook"
          ? "I have a Page, connect Facebook"
          : "I switched, connect Instagram"}
      </ConnectSubmit>
    </ConnectForm>
  );
}
