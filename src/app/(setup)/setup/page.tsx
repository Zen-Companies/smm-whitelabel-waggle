import { Suspense } from "react";
import { requirePlan } from "@/features/billing";
import { parseStep, SetupView } from "@/features/setup";
import { getOpenOrg } from "@/features/tenants";

export const metadata = { title: "Set up Waggle" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

async function Setup({ searchParams }: Props) {
  const [params, org] = await Promise.all([searchParams, getOpenOrg()]);
  // Plan before setup (18 Nov).
  if (org) await requirePlan(org.id, org.role);
  const connecting = typeof params.connecting === "string" ? params.connecting : undefined;
  return (
    <SetupView step={parseStep(params.step)} connecting={connecting} more={params.more === "1"} />
  );
}

export default function SetupPage({ searchParams }: Props) {
  return (
    <Suspense
      fallback={<div className="skeleton mx-auto mt-12 h-96 w-full max-w-[760px] rounded-xl" />}
    >
      <Setup searchParams={searchParams} />
    </Suspense>
  );
}
