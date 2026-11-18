import { redirect } from "next/navigation";
import { Suspense } from "react";
import { LOADING_WORDS, PageLoading } from "@/components/app/page-loading";
import { planGateFor, PlanStep } from "@/features/billing";
import { getOpenOrg } from "@/features/tenants";

export const metadata = { title: "Pick your plan" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

async function Step({ searchParams }: Props) {
  const [params, org] = await Promise.all([searchParams, getOpenOrg()]);
  if (!org) redirect("/login");
  const state = await planGateFor(org.id, org.role);
  if (state.gate === "open") redirect("/welcome");
  return (
    <PlanStep
      org={{ id: org.id, name: org.name }}
      state={state}
      cancelled={params.checkout === "cancelled"}
    />
  );
}

/** Plan before setup (approved 18 Nov): step 0 of Get Waggle ready. */
export default function StartPage(props: Props) {
  return (
    <Suspense fallback={<PageLoading words={LOADING_WORDS.plan} />}>
      <Step searchParams={props.searchParams} />
    </Suspense>
  );
}
