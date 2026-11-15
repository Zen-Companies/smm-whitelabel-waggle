import { Suspense } from "react";
import { parseStep, SetupView } from "@/features/setup";

export const metadata = { title: "Set up Waggle" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

async function Setup({ searchParams }: Props) {
  const params = await searchParams;
  const connecting = typeof params.connecting === "string" ? params.connecting : undefined;
  return <SetupView step={parseStep(params.step)} connecting={connecting} />;
}

export default function SetupPage({ searchParams }: Props) {
  return (
    <Suspense
      fallback={<div className="skeleton mx-auto mt-12 h-96 w-full max-w-[680px] rounded-xl" />}
    >
      <Setup searchParams={searchParams} />
    </Suspense>
  );
}
