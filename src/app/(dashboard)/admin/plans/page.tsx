import { Suspense } from "react";
import { PlansView } from "@/features/billing";

export const metadata = { title: "Plans" };

export default function Page() {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 py-6 md:px-8">
      <div className="flex flex-col gap-1">
        <h1 className="page-title">Plans</h1>
        <p className="text-ink-2">
          The plans from the Pricing Bible. Prices change only there (Jason). Set how many brands
          each plan includes; blank is no limit. Limits apply once billing is on.
        </p>
      </div>
      <Suspense fallback={<div className="skeleton h-64" />}>
        <PlansView />
      </Suspense>
    </main>
  );
}
