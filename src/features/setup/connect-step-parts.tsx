import Link from "next/link";
import { BeeBody } from "@/components/app/bee";
import { StateMark } from "@/components/app/state-mark";
import { buttonVariants } from "@/components/ui/button";
import { connectAccount } from "@/features/accounts";
import { upgradeHref } from "@/features/billing";
import { platformLabel } from "@/lib/social/platforms";
import { connectFirstAccount } from "./actions";
import { ConnectSubmit } from "./connect-pending";
import type { ConnectProblem } from "./first-connect";
import { PRIMARY } from "./setup-frame";

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
  return (
    <section role="alert" className="flex flex-col gap-3">
      <div className="border-danger-border bg-danger-soft rounded-xl border p-4">
        <h2 className="text-danger text-[15px] font-semibold">That’s a personal Instagram</h2>
        <p className="text-ink mt-1 text-sm">
          Switch it to business or creator in Instagram’s settings.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <ConnectForm platform="instagram" hasBrand={hasBrand}>
          <ConnectSubmit platform="Instagram" className={PRIMARY}>
            I switched, try again
          </ConnectSubmit>
        </ConnectForm>
        <Link href="/welcome" className={buttonVariants({ variant: "secondary" })}>
          Pick another
        </Link>
      </div>
    </section>
  );
}
