import { Suspense } from "react";
import { SetupLoading } from "@/components/app/setup-loading";
import { connectBanner, FirstConnectTag } from "@/features/accounts";
import { connectProblem, SetupView } from "@/features/setup";
import { getOpenOrg } from "@/features/tenants";

export const metadata = { title: "Set up Waggle" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/**
 * Setup steps 2 and 3 (Walter's flow, one screen at a time, approved 20 Nov): `?screen=` opens a
 * screen, else the one left. Old links (`?step=` of the 5-step setup, `/setup/resume`, `/reveal`)
 * land here and open where the owner left off; with nothing connected it's step 1, /welcome.
 * A first connect that failed comes back here with `error` (23 Nov): the connecting screen says
 * what happened in place.
 */
async function Setup({ searchParams }: Props) {
  const params = await searchParams;
  const banner = connectBanner(params);
  return (
    <SetupView
      requested={one(params.screen) ?? null}
      connecting={one(params.connecting)}
      problem={connectProblem(params, banner?.tone === "error" ? banner.text : null)}
      go={params.go === "1"}
    />
  );
}

/** The ads' ConnectAccount event, once, after the organization's first connect (19 Nov). */
async function ConnectTag() {
  const org = await getOpenOrg();
  return org ? <FirstConnectTag orgId={org.id} isOwner={org.role === "owner"} /> : null;
}

export default function SetupPage({ searchParams }: Props) {
  return (
    <>
      <Suspense
        fallback={
          <main className="mx-auto w-full max-w-[640px] px-4">
            <SetupLoading />
          </main>
        }
      >
        <Setup searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={null}>
        <ConnectTag />
      </Suspense>
    </>
  );
}
