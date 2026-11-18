import { LOADING_WORDS, PageLoading } from "@/components/app/page-loading";
import { Suspense } from "react";
import { PlansView } from "@/features/billing";

export const metadata = { title: "Plans" };

export default function Page() {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 py-6 md:px-8">
      <div className="flex flex-col gap-1">
        <h1 className="page-title">Plans</h1>
        <p className="text-ink-2">
          The plans from the Pricing Bible (docs/Waggle Pricing Bible 1.md): Jason agrees every
          change. Limits apply once billing is on.
        </p>
      </div>
      <Suspense fallback={<PageLoading words={LOADING_WORDS.admin} />}>
        <PlansView />
      </Suspense>
    </main>
  );
}
