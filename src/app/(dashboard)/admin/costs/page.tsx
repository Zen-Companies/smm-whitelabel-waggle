import { Suspense } from "react";
import { CostView } from "@/features/billing";

export const metadata = { title: "Costs" };

export default function CostsPage() {
  return (
    <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 px-4 py-6 md:px-8">
      <div className="flex flex-col gap-1">
        <h1 className="page-title">Costs</h1>
        <p className="text-ink-2">Staff view: what each business costs to run.</p>
      </div>
      <Suspense fallback={<div className="skeleton h-72" />}>
        <CostView />
      </Suspense>
    </main>
  );
}
