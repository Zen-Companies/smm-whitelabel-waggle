import { Suspense } from "react";
import { CostView } from "@/features/billing";

export const metadata = { title: "Costs" };

export default function CostsPage() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <h1 className="page-title">Costs</h1>
        <p className="text-gray-600">Operator view: what each business costs to run.</p>
      </div>
      <Suspense fallback={<div className="skeleton h-72" />}>
        <CostView />
      </Suspense>
    </main>
  );
}
