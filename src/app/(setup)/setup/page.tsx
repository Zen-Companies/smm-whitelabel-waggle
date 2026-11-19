import { Suspense } from "react";
import { FirstConnectTag } from "@/features/accounts";
import { parseStep, SetupView } from "@/features/setup";
import { getOpenOrg } from "@/features/tenants";

export const metadata = { title: "Set up Waggle" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

async function Setup({ searchParams }: Props) {
  const params = await searchParams;
  const connecting = typeof params.connecting === "string" ? params.connecting : undefined;
  return (
    <SetupView step={parseStep(params.step)} connecting={connecting} more={params.more === "1"} />
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
        fallback={<div className="skeleton mx-auto mt-12 h-96 w-full max-w-[760px] rounded-xl" />}
      >
        <Setup searchParams={searchParams} />
      </Suspense>
      <Suspense fallback={null}>
        <ConnectTag />
      </Suspense>
    </>
  );
}
