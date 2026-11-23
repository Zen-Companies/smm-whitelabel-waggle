import { Check } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Brand } from "@/components/app/brand";
import { confirmEmailToken } from "@/features/tenants";
import { getServiceClient } from "@/lib/supabase/service";

export const metadata = { title: "Confirm your email" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

// The confirm link (hotfix 21 Nov, canvas "Sign up without waiting for the email", screen 4).
// It opens wherever the phone opens mail links, so it works without being signed in there.
async function Confirm({ searchParams }: Props) {
  const { token } = await searchParams;
  const result = await confirmEmailToken(getServiceClient(), typeof token === "string" ? token : "");
  const ok = result !== "invalid";
  return (
    <>
      {ok ? (
        <span className="bg-success-soft text-success inline-flex size-12 items-center justify-center rounded-full">
          <Check className="size-6" strokeWidth={2} aria-hidden />
        </span>
      ) : null}
      <h1 className="display-title">{ok ? "Email confirmed" : "This link doesn’t work anymore"}</h1>
      <p className="text-ink-2 max-w-sm">
        {ok
          ? "Thanks. You can close this tab or go back to Waggle."
          : "A newer link was sent, or it was already used. Open Waggle and tap Send again on the line at the top."}
      </p>
      <Link
        href="/today"
        className="bg-honey hover:bg-honey-hover inline-flex min-h-11 items-center rounded-xl px-4 text-sm font-semibold text-[#17140F] no-underline"
      >
        Back to Waggle
      </Link>
    </>
  );
}

export default function EmailConfirmedPage({ searchParams }: Props) {
  return (
    <main className="bg-page flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <Brand />
      <Suspense fallback={<div className="skeleton h-40 w-full max-w-sm rounded-xl" />}>
        <Confirm searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
