import Link from "next/link";
import { Suspense } from "react";
import { Brand } from "@/components/app/brand";
import { StateMark } from "@/components/app/state-mark";
import { buttonVariants } from "@/components/ui/button";
import { connectionLabel, ConnectTrace, DEFAULT_RETURN, safeReturnPath } from "@/features/accounts";
import { TellOtherTab } from "./tell-other-tab";

export const metadata = { title: "Connected" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/**
 * Where the new tab lands after the partner's sign-in (design "connecting in a new tab", approved
 * 18 Nov). Tells the Waggle tab that started it, and always has a way back (phones often can't
 * close a tab for you). Zernio adds `error` and `error_message` when it didn't work. `back` is the
 * page the connect started from (setup step 2 for the brand's first account, 20 Nov).
 */
async function Body({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const id = first(params.platform) ?? "";
  const label = connectionLabel(id);
  const error = first(params.error);
  const message = first(params.error_message)?.slice(0, 300);
  const ok = !error || error === "code_already_redeemed";
  const back = safeReturnPath(first(params.back)) ?? DEFAULT_RETURN;
  const onAccounts = back === DEFAULT_RETURN;
  const where = onAccounts ? "Connected accounts" : back.startsWith("/setup") ? "setup" : "Waggle";
  return (
    <div className="card flex w-full max-w-[480px] flex-col items-start gap-4 p-7">
      <Brand />
      {ok ? (
        <h1 className="font-display flex items-center gap-2 text-2xl font-semibold">
          <StateMark state="working" size={18} /> {label} is connected
        </h1>
      ) : (
        <h1 className="font-display flex items-center gap-2 text-2xl font-semibold">
          <StateMark state="needs" size={18} /> {label} didn&apos;t connect
        </h1>
      )}
      <p className="text-ink-2">
        {ok
          ? "Go back to your other Waggle tab: it already shows it. Or carry on here."
          : (message ?? `The sign-in didn't finish. Try again from ${where}.`)}
      </p>
      <Link
        href={ok || !onAccounts ? back : `${back}#more-heading`}
        className={buttonVariants({ variant: "primary" })}
      >
        {ok ? `Back to ${where}` : "Try again"}
      </Link>
      <TellOtherTab id={id} ok={ok} />
      <ConnectTrace always />
    </div>
  );
}

export default function ConnectDonePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <main className="bg-page flex min-h-dvh items-start justify-center px-4 py-16">
      <Suspense fallback={<div className="card h-56 w-full max-w-[480px]" />}>
        <Body searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
