import { Suspense } from "react";
import { ReadinessCard } from "@/features/approvals";
import { PracticeSection } from "@/features/lab";

export const metadata = { title: "Lab" };

/** The owner's Lab (T35): try messages and see whether replies are ready to go out on their own. */
export default function LabPage() {
  return (
    <main className="flex w-full max-w-[1440px] flex-col gap-5 px-4 py-6 md:px-8">
      <div className="flex flex-col gap-1">
        <h1 className="page-title">Lab</h1>
        <p className="text-gray-700">
          Check your receptionist before it replies on its own. Practice only: nothing is posted.
        </p>
      </div>
      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(320px,440px)]">
        <Suspense fallback={<div className="skeleton h-72" />}>
          <PracticeSection />
        </Suspense>
        <Suspense fallback={<div className="skeleton h-72" />}>
          <ReadinessCard />
        </Suspense>
      </div>
    </main>
  );
}
